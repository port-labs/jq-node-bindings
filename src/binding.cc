#include <list>
#include <unordered_map>
#include <assert.h>
#include <string>
#include <stdio.h>
#include <string.h>
#include <pthread.h>

#include "src/binding.h"


// #ifdef DEBUG_MODE
// static bool debug_enabled = true;
// #else
// static bool debug_enabled = false;
// #endif

// #define DEBUG_LOG(fmt, ...) \
//     do { if (debug_enabled) printf("[DEBUG] " fmt "\n", ##__VA_ARGS__); } while (0)

// #define ASYNC_DEBUG_LOG(work, fmt, ...) \
//     do { if (debug_enabled) printf("[DEBUG][ASYNC][%p] " fmt "\n", (jv*)work, ##__VA_ARGS__); } while (0)

// #define CACHE_DEBUG_LOG(cache, fmt, ...) \
//     do { if (debug_enabled) printf("[DEBUG][CACHE][%p] " fmt "\n", (void*)cache, ##__VA_ARGS__); } while (0)

// #define WRAPPER_DEBUG_LOG(wrapper, fmt, ...) \
//     do { if (debug_enabled) printf("[DEBUG][WRAPPER:%p] " fmt "\n", (void*)wrapper, ##__VA_ARGS__); } while (0)
#ifdef ENABLE_DEBUG  // We'll use ENABLE_DEBUG as our flag name
#define DEBUG_ENABLED 1
#else
#define DEBUG_ENABLED 0
#endif

#ifdef ENABLE_DEBUG
#define DEBUG_LOG(fmt, ...) fprintf(stderr, "[DEBUG] " fmt "\n", ##__VA_ARGS__)
#define ASYNC_DEBUG_LOG(work, fmt, ...) fprintf(stderr, "[DEBUG][ASYNC][%p] " fmt "\n", (void*)work, ##__VA_ARGS__)
#define CACHE_DEBUG_LOG(cache, fmt, ...) fprintf(stderr, "[DEBUG][CACHE][%p] " fmt "\n", (void*)cache, ##__VA_ARGS__)
#define WRAPPER_DEBUG_LOG(wrapper, fmt, ...) fprintf(stderr, "[DEBUG][WRAPPER][%p] " fmt "\n", (void*)wrapper, ##__VA_ARGS__)
#else
#define DEBUG_LOG(fmt, ...) ((void)0)
#define ASYNC_DEBUG_LOG(work, fmt, ...) ((void)0)
#define CACHE_DEBUG_LOG(cache, fmt, ...) ((void)0)
#define WRAPPER_DEBUG_LOG(wrapper, fmt, ...) ((void)0)
#endif

static size_t global_cache_size = 100;
static unsigned int global_timeout_sec = 5;

static size_t get_uv_thread_pool_size() {
    const char* uv_threads = getenv("UV_THREADPOOL_SIZE");
    if (uv_threads != nullptr) {
        int thread_count = atoi(uv_threads);
        if (thread_count > 0) {
            return static_cast<size_t>(thread_count);
        }
    }
    return global_cache_size;
}

static size_t validate_cache_size(size_t requested_size) {
    size_t min_size = get_uv_thread_pool_size();
    size_t new_size = std::max(requested_size, min_size);
    if(requested_size < min_size){
        DEBUG_LOG("Requested cache size %zu adjusted to minimum %zu (UV thread pool size)",requested_size,min_size);
        return min_size;
    }
    return new_size;
}

/* err_data and throw_err_cb to get jq error message*/
struct err_data {
    char buf[4096];
};
void throw_err_cb(void* data, jv msg) {
  struct err_data *err_data = (struct err_data *)data;
  if (jv_get_kind(msg) != JV_KIND_STRING)
    msg = jv_dump_string(msg, JV_PRINT_INVALID);
  if (!strncmp(jv_string_value(msg), "jq: error", sizeof("jq: error") - 1))
    snprintf(err_data->buf, sizeof(err_data->buf), "jq: compile error%s", jv_string_value(msg) + strlen("jq: error"));
  if (strchr(err_data->buf, '\n'))
    *(strchr(err_data->buf, '\n')) = '\0';
  jv_free(msg);
}

/* check napi status to throw error if napi_status is not ok */
inline bool CheckNapiStatus(napi_env env, napi_status status, const char* message) {
    if (status != napi_ok) {
        napi_throw_error(env, nullptr, message);
        return false;
    }
    return true;
}

template <class KEY_T> class LRUCache;

struct JqFilterWrapper {
    friend class LRUCache<std::string>;
public:
    std::string filter_name;
    std::list<JqFilterWrapper*>::iterator cache_pos;
    /* init mutex and set filter_name */
    explicit JqFilterWrapper(jq_state* jq_, std::string filter_name_) :
        filter_name(filter_name_),
        jq(jq_) {
        DEBUG_LOG("[WRAPPER:%p] Creating wrapper for filter: %s", (void*)this, filter_name_.c_str());
        pthread_mutex_init(&filter_mutex, nullptr);
    }

    /* free jq and destroy mutex */
    ~JqFilterWrapper() {
        WRAPPER_DEBUG_LOG(this, "Destroying wrapper: %s", filter_name.c_str());
        if (jq) {
            WRAPPER_DEBUG_LOG(this, "Tearing down jq state");
            jq_teardown(&jq);
        }
        pthread_mutex_destroy(&filter_mutex);
        WRAPPER_DEBUG_LOG(this, "Destroyed");
    }
    jq_state* get_jq(){
        return jq;
    }
    void lock(){
        WRAPPER_DEBUG_LOG(this, "Attempting to lock mutex");
        pthread_mutex_lock(&filter_mutex);
        WRAPPER_DEBUG_LOG(this, "Mutex locked");
    }
    void unlock(){
        WRAPPER_DEBUG_LOG(this, "Unlocking mutex");
        pthread_mutex_unlock(&filter_mutex);
        WRAPPER_DEBUG_LOG(this, "Mutex unlocked");
    }
private:
    jq_state* jq;
    pthread_mutex_t filter_mutex;

};

template <class KEY_T> class LRUCache {
private:
    pthread_mutex_t cache_mutex;
    std::list<JqFilterWrapper*> item_list;
    std::unordered_map<KEY_T,  JqFilterWrapper*> item_map;
    std::unordered_map<JqFilterWrapper*,  size_t> item_refcnt;

    size_t cache_size;

    void clean() {
        pthread_mutex_lock(&cache_mutex);
        CACHE_DEBUG_LOG(nullptr, "Starting cleanup. Current size=%zu, target=%zu", item_map.size(), cache_size);
        if(item_map.size() < cache_size){
            pthread_mutex_unlock(&cache_mutex);
            return;
        }
        while (item_list.size() > cache_size) {
            auto last_it = item_list.end();
            last_it--;
            JqFilterWrapper* wrapper = *last_it;
            CACHE_DEBUG_LOG((void*)wrapper, "Examining wrapper: name='%s', refcnt=%zu", wrapper->filter_name.c_str(), item_refcnt[wrapper]);
            if(item_refcnt[wrapper]>0){
                CACHE_DEBUG_LOG((void*)wrapper, "Wrapper is busy, skipping");
                break;
            }
            if(wrapper->filter_name == ""){
                CACHE_DEBUG_LOG((void*)wrapper, "WARNING: Empty filter name found");
            }
            CACHE_DEBUG_LOG((void*)wrapper, "attempting to remove wrapper from cache");
            if(item_map.find(wrapper->filter_name)->second == wrapper){
                CACHE_DEBUG_LOG((void*)wrapper, "Removing wrapper from cache");
                item_map.erase(wrapper->filter_name);
            };
            item_refcnt.erase(wrapper);
            item_list.pop_back();
            CACHE_DEBUG_LOG((void*)wrapper, "Deleting wrapper");
            delete wrapper;

        }
        CACHE_DEBUG_LOG(this, "Cleanup complete. New size=%zu", item_map.size());
        pthread_mutex_unlock(&cache_mutex);
    }

public:
    LRUCache(int cache_size_) : cache_size(global_cache_size) {
        pthread_mutex_init(&cache_mutex, nullptr);
        CACHE_DEBUG_LOG(this, "Created cache with size %zu", cache_size);
    }
      ~LRUCache() {
        //clear cache
        pthread_mutex_destroy(&cache_mutex);
    }
    void inc_refcnt(JqFilterWrapper* val){
        CACHE_DEBUG_LOG((void*)val, "Incrementing refcnt for wrapper:%p", (void*)val);
        item_refcnt[val]++;
    }
    void dec_refcnt(JqFilterWrapper* val){
        pthread_mutex_lock(&cache_mutex);
        CACHE_DEBUG_LOG((void*)val, "Decrementing refcnt for wrapper:%p", (void*)val);
        item_refcnt[val]--;
        pthread_mutex_unlock(&cache_mutex);
    }
    void put(const KEY_T &key, JqFilterWrapper* val) {
        CACHE_DEBUG_LOG((void*)val, "Putting key='%s' wrapper:%p", key.c_str(), (void*)val);
        pthread_mutex_lock(&cache_mutex);
        inc_refcnt(val);
        CACHE_DEBUG_LOG((void*)val, "Got cache lock for put operation");

        auto it = item_map.find(key);
        if (it != item_map.end()) {
            CACHE_DEBUG_LOG((void*)val, "Replacing existing entry for key='%s', old_ptr=%p , new_ptr=%p", key.c_str(), (void*)it->second, (void*)val);
            item_map.erase(it);
        }
        item_list.push_front(val);
        val->cache_pos = item_list.begin();

        item_map.insert(std::make_pair(key, val));
        CACHE_DEBUG_LOG((void*)val, "Added wrapper:%p to cache", (void*)val);
        pthread_mutex_unlock(&cache_mutex);
        CACHE_DEBUG_LOG((void*)val, "Released cache lock after put");
        clean();
    }

    JqFilterWrapper* get(const KEY_T &key) {
        pthread_mutex_lock(&cache_mutex);
        CACHE_DEBUG_LOG(nullptr, "Got cache lock for get operation, key='%s'", key.c_str());

        if(!(item_map.count(key) > 0)){
            CACHE_DEBUG_LOG(nullptr, "Cache miss for key='%s'", key.c_str());
            pthread_mutex_unlock(&cache_mutex);
            return nullptr;
        }

        auto it = item_map.find(key);
        JqFilterWrapper* wrapper = it->second;
        item_list.erase(wrapper->cache_pos);
        item_list.push_front(wrapper);
        wrapper->cache_pos = item_list.begin();
        inc_refcnt(wrapper);
        CACHE_DEBUG_LOG((void*)wrapper, "Cache hit for jq wrapper,pointer=%p,name=%s,refcnt=%zu",
                 (void*)wrapper, wrapper->filter_name.c_str(),item_refcnt[wrapper]);
        pthread_mutex_unlock(&cache_mutex);
        CACHE_DEBUG_LOG((void*)wrapper, "Released cache lock after get");
        return wrapper;
    }
    void resize(size_t new_size) {
        pthread_mutex_lock(&cache_mutex);
        CACHE_DEBUG_LOG(this, "Resizing cache from %zu to %zu", cache_size, new_size);
        cache_size = new_size;
        pthread_mutex_unlock(&cache_mutex);
        clean();  // Trigger cleanup if needed
    }
};

LRUCache<std::string> cache(100);

std::string FromNapiString(napi_env env, napi_value value) {
    size_t str_size;
    size_t str_size_out;
    napi_status status;
    status=napi_get_value_string_utf8(env, value, nullptr, 0, &str_size);
    if(!CheckNapiStatus(env,status,"error loading string lenth")){
        return "";
    }
    char* str = new char[str_size + 1];
    status=napi_get_value_string_utf8(env, value, str, str_size + 1, &str_size_out);
    if(!CheckNapiStatus(env,status,"error loading string")){
        delete[] str;
        return "";
    }

    std::string result(str);
    delete[] str;
    return result;
}

bool jv_object_to_napi(std::string key, napi_env env, jv actual, napi_value ret,std::string& err_msg) {
    jv_kind kind = jv_get_kind(actual);
    napi_value value;
    napi_status status = napi_invalid_arg;
    switch (kind) {
        case JV_KIND_INVALID: {
            jv msg = jv_invalid_get_msg(jv_copy(actual));

            if (jv_get_kind(msg) == JV_KIND_STRING) {
                err_msg = std::string("jq: error: ") + jv_string_value(msg);
                jv_free(msg);
                return false;
            }
            napi_get_undefined(env, &ret);
            return true;
        }
        case JV_KIND_NULL: {
            status=napi_get_null(env, &value);
            break;
        }
        case JV_KIND_TRUE: {
            status=napi_get_boolean(env, true, &value);
            break;
        }
        case JV_KIND_FALSE: {
            status=napi_get_boolean(env, false, &value);
            break;
        }
        case JV_KIND_NUMBER: {
            double num = jv_number_value(actual);
            status=napi_create_double(env, num, &value);
            break;
        }
        case JV_KIND_STRING: {
            status=napi_create_string_utf8(env, jv_string_value(actual), NAPI_AUTO_LENGTH, &value);
            break;
        }
        case JV_KIND_ARRAY: {
            size_t arr_len = jv_array_length(jv_copy(actual));
            status=napi_create_array_with_length(env, arr_len, &value);

            for (size_t i = 0; i < arr_len; i++) {
                jv v = jv_array_get(jv_copy(actual), i);
                bool success = jv_object_to_napi(std::to_string(i), env, v, value,err_msg);
                if(!success){
                    jv_free(v);
                    return false;
                }
                jv_free(v);
            }
            break;
        }
        case JV_KIND_OBJECT: {
            status=napi_create_object(env, &value);

            int iter = jv_object_iter(actual);
            while (jv_object_iter_valid(actual, iter)) {

                jv obj_key = jv_object_iter_key(actual, iter);
                jv obj_value = jv_object_iter_value(actual, iter);

                bool success = jv_object_to_napi(jv_string_value(obj_key), env, obj_value, value,err_msg);
                if(!success){
                    jv_free(obj_key);
                    jv_free(obj_value);
                    return false;
                }

                jv_free(obj_key);
                jv_free(obj_value);

                iter = jv_object_iter_next(actual, iter);
            }
            break;
        }
        // default:
        //     napi_throw_error(env, nullptr, "Unsupported jv type");
        //     break;
    }
    if(status != napi_ok){
        err_msg = "error creating napi object";
        return false;
    }
    napi_set_named_property(env, ret, key.c_str(), value);
    return true;
}

static jv jq_input_cb(jq_state *jq, void *data) {
    jv *input_ptr = (jv*)data;
    if (jv_is_valid(*input_ptr)) {
        jv ret = jv_copy(*input_ptr);
        jv_free(*input_ptr);
        *input_ptr = jv_null();
        return ret;
    }
    return jv_invalid();
}


napi_value ExecSync(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_status status;
    status=napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    CheckNapiStatus(env,status,"Error loading info");

    if (argc < 2) {
        napi_throw_type_error(env, nullptr, "Wrong number of arguments. Expected 2.");
        return nullptr;
    }

    std::string json = FromNapiString(env, args[0]);
    if(json == ""){
        napi_throw_error(env, nullptr, "Invalid JSON input");
        return nullptr;
    }
    std::string filter = FromNapiString(env, args[1]);
    if(filter == ""){
        napi_throw_error(env, nullptr, "Invalid filter input");
        return nullptr;
    }

    struct err_data err_msg;
    JqFilterWrapper* wrapper;

    DEBUG_LOG("[SYNC] ExecSync called with filter='%s'", filter.c_str());

    wrapper = cache.get(filter);
    if (wrapper == nullptr) {
        DEBUG_LOG("[SYNC] Creating new wrapper for filter='%s'", filter.c_str());
        jq_state* jq;
        jq = jq_init();
        jq_set_error_cb(jq, throw_err_cb, &err_msg);
        if (!jq_compile(jq, filter.c_str())) {
            napi_throw_error(env, nullptr, err_msg.buf);
            return nullptr;
        }
        if (jq == nullptr) {
            napi_throw_error(env, nullptr, "Failed to initialize jq");
            return nullptr;
        }
        wrapper = new JqFilterWrapper(jq, filter);
        cache.put(filter, wrapper );
    }

    jv input = jv_parse(json.c_str());
    if (!jv_is_valid(input)) {
        jv_free(input);
        napi_throw_error(env, nullptr, "Invalid JSON input");
        wrapper->unlock();
        return nullptr;
    }

    wrapper->lock();
    jq_set_input_cb(wrapper->get_jq(), jq_input_cb, &input);

    jq_start(wrapper->get_jq(), input, 0);
    jv result = jq_next(wrapper->get_jq(), global_timeout_sec);

    napi_value ret;
    napi_create_object(env, &ret);
    std::string err_msg_conversion;
    bool success = jv_object_to_napi("value",env,result,ret,err_msg_conversion);
    if(!success){
        napi_throw_error(env, nullptr, err_msg_conversion.c_str());
        jv_free(result);
        wrapper->unlock();
        cache.dec_refcnt(wrapper);
        return nullptr;
    }

    jv_free(result);
    wrapper->unlock();
    cache.dec_refcnt(wrapper);
    return ret;
}

struct AsyncWork {
    /* input */
    std::string json;
    std::string filter;
    unsigned int timeout_sec;
    /* promise */
    napi_deferred deferred;
    napi_async_work async_work;
    /* output */
    bool is_undefined;
    std::string result;
    std::string error;
    bool success;
};

void ExecuteAsync(napi_env env, void* data) {
    AsyncWork* work = static_cast<AsyncWork*>(data);
    ASYNC_DEBUG_LOG(work, "ExecuteAsync started for filter='%s'", work->filter.c_str());

    struct err_data err_msg;
    JqFilterWrapper* wrapper;

    wrapper = cache.get(work->filter);
    if (wrapper == nullptr) {
        ASYNC_DEBUG_LOG(work, "Creating new jq wrapper for filter='%s'", work->filter.c_str());
        jq_state* jq;
        jq = jq_init();
        jq_set_error_cb(jq, throw_err_cb, &err_msg);
        if (!jq_compile(jq, work->filter.c_str())) {
            ASYNC_DEBUG_LOG(work, "jq compilation failed");
            work->error = err_msg.buf;
            work->success = false;
            return;
        }
        wrapper=new JqFilterWrapper(jq, work->filter);
        cache.put(work->filter, wrapper );
    }

    jv input = jv_parse_sized(work->json.c_str(), work->json.size());
    ASYNC_DEBUG_LOG(work, "JSON input parsed");

    if (!jv_is_valid(input)) {
        ASYNC_DEBUG_LOG(work, "Invalid JSON input");
        work->error = "Invalid JSON input";
        work->success = false;
        jv_free(input);
        cache.dec_refcnt(wrapper);
        wrapper->unlock();

        return;
    }
    wrapper->lock();
    jq_set_input_cb(wrapper->get_jq(), jq_input_cb, &input);
    jq_start(wrapper->get_jq(), input, 0);
    ASYNC_DEBUG_LOG(work, "jq execution started");

    jv result=jq_next(wrapper->get_jq(), work->timeout_sec);
    if(jv_get_kind(result) == JV_KIND_INVALID){
        jv msg = jv_invalid_get_msg(jv_copy(result));

        if (jv_get_kind(msg) == JV_KIND_STRING) {
            work->error = std::string("jq: error: ") + jv_string_value(msg);
            jv_free(msg);
            work->success=false;
        }else{
            work->is_undefined = true;
            work->success=true;
        }
    }else{
        jv dump  = jv_dump_string(result, JV_PRINT_INVALID);
        if(jv_is_valid(dump)){
            work->result = jv_string_value(dump);
            work->success = true;
        }else{
            ASYNC_DEBUG_LOG(work, "failed to get result");
            work->error = "failed to get result";
            work->success = false;
        }
        jv_free(dump);
    }
    wrapper->unlock();
    cache.dec_refcnt(wrapper);

    ASYNC_DEBUG_LOG(work, "jq execution finished - got result, %s", work->result.c_str());
}

void reject_with_error_message(napi_env env, napi_deferred deferred, std::string error_message){
    napi_value error;
    napi_create_string_utf8(env, error_message.c_str(), NAPI_AUTO_LENGTH, &error);
    napi_value error_obj;
    napi_create_object(env, &error_obj);
    napi_set_named_property(env, error_obj, "message", error);
    napi_reject_deferred(env, deferred, error_obj);
}

void CompleteAsync(napi_env env, napi_status status, void* data) {
    AsyncWork* work = static_cast<AsyncWork*>(data);
   bool cleanup_done = false;

    auto cleanup = [&]() {
        if (!cleanup_done) {
            napi_delete_async_work(env, work->async_work);
            ASYNC_DEBUG_LOG(work, "Deleting AsyncWork");
            delete work;
            cleanup_done = true;
        }
    };

    if(status != napi_ok || !work->success){
        std::string error_message = work->error;
        if(error_message == ""){
            error_message = "Got error from async work";
        }
        reject_with_error_message(env, work->deferred, error_message);
        cleanup();
        return;
    }
    napi_handle_scope scope;
    status = napi_open_handle_scope(env, &scope);
    if (status != napi_ok) {
        reject_with_error_message(env, work->deferred, "Failed to create handle scope");
        cleanup();
        return;
    }

        napi_value ret;

        status=napi_create_object(env, &ret);

        jv result_jv;
        if(work->is_undefined){
            result_jv = jv_invalid();
        }else{
            result_jv= jv_parse(work->result.c_str());
        }
        std::string err_msg_conversion;
        bool success = jv_object_to_napi("value", env, result_jv, ret,err_msg_conversion);
        jv_free(result_jv);

        if(!success){
            reject_with_error_message(env, work->deferred, err_msg_conversion);
            napi_close_handle_scope(env, scope);
            return;
        }
        napi_resolve_deferred(env, work->deferred, ret);
    cleanup();
    napi_close_handle_scope(env, scope);
}



napi_value ExecAsync(napi_env env, napi_callback_info info) {
    napi_handle_scope scope;

    size_t argc = 3;
    napi_value args[3];
    napi_value promise;

    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    if (argc < 2) {
        napi_throw_type_error(env, nullptr, "Wrong number of arguments. Expected 2.");
        return nullptr;
    }

    AsyncWork* work = new AsyncWork();
    work->json = FromNapiString(env, args[0]);
    if(work->json == ""){
        napi_throw_error(env, nullptr, "Invalid JSON input");
        return nullptr;
    }
    work->filter = FromNapiString(env, args[1]);
    if(work->filter == ""){
        napi_throw_error(env, nullptr, "Invalid filter input");
        return nullptr;
    }

    work->timeout_sec = global_timeout_sec;
    if(argc > 2){
      napi_valuetype valuetype;
      napi_status status = napi_typeof(env, args[2], &valuetype);
      if(status != napi_ok){
        napi_throw_error(env, nullptr, "Invalid timeout_sec input");
        return nullptr;
      }
      if(valuetype == napi_number){
        status = napi_get_value_uint32(env, args[2], &work->timeout_sec);
        if (status != napi_ok) {
          napi_throw_error(env, nullptr, "Invalid timeout_sec input");
          return nullptr;
        }
      }
    }
    work->success = false;

    napi_create_promise(env, &work->deferred, &promise);

    napi_value resource_name;
    napi_create_string_utf8(env, "ExecAsync", NAPI_AUTO_LENGTH, &resource_name);

    napi_create_async_work(env, nullptr, resource_name, ExecuteAsync, CompleteAsync, work, &work->async_work);
    napi_queue_async_work(env, work->async_work);

    return promise;
}

// napi_value SetDebugMode(napi_env env, napi_callback_info info) {
//     size_t argc = 1;
//     napi_value args[1];
//     bool enable;

//     napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

//     if (argc < 1) {
//         napi_throw_type_error(env, nullptr, "Wrong number of arguments");
//         return nullptr;
//     }

//     napi_get_value_bool(env, args[0], &enable);
//     debug_enabled = enable;
//     DEBUG_LOG("Debug mode %s", enable ? "enabled" : "disabled");

//     napi_value result;
//     napi_get_boolean(env, debug_enabled, &result);
//     return result;
// }

// napi_value GetCacheStats(napi_env env, napi_callback_info info) {
//     napi_value result;
//     napi_create_object(env, &result);
//     struct rusage usage;
//     getrusage(RUSAGE_SELF, &usage);
//     napi_value maxrss;
//     napi_create_int64(env, usage.ru_maxrss, &maxrss);
//     napi_set_named_property(env, result, "max_rss", maxrss);
//     return result;
// }

napi_value SetCacheSize(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    int64_t new_size;

    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    napi_status status;
    if (argc < 1) {
        napi_throw_type_error(env, nullptr, "Wrong number of arguments");
        return nullptr;
    }

    status=napi_get_value_int64(env, args[0], &new_size);
    if(!CheckNapiStatus(env,status,"error loading int64")){
        return nullptr;
    }
    if (new_size <= 0) {
        napi_throw_error(env, nullptr, "Cache size must be positive");
        return nullptr;
    }

    DEBUG_LOG("Changing cache size from %zu to %lld", global_cache_size, new_size);
    size_t old_size = global_cache_size;

    global_cache_size = validate_cache_size(static_cast<size_t>(new_size));
    cache.resize(global_cache_size);  // Update cache size

    napi_value result;
    napi_create_int64(env, global_cache_size, &result);
    return result;
}

napi_value Init(napi_env env, napi_value exports) {
    napi_value exec_sync, exec_async, cache_size_fn,cache_stats_fn;

    napi_create_function(env, "execSync", NAPI_AUTO_LENGTH, ExecSync, nullptr, &exec_sync);
    napi_create_function(env, "execAsync", NAPI_AUTO_LENGTH, ExecAsync, nullptr, &exec_async);
    // napi_create_function(env, "setDebugMode", NAPI_AUTO_LENGTH, SetDebugMode, nullptr, &debug_fn);
    napi_create_function(env, "setCacheSize", NAPI_AUTO_LENGTH, SetCacheSize, nullptr, &cache_size_fn);
    // napi_create_function(env, "getCacheStats", NAPI_AUTO_LENGTH, GetCacheStats, nullptr, &cache_stats_fn);
    napi_set_named_property(env, exports, "execSync", exec_sync);
    napi_set_named_property(env, exports, "execAsync", exec_async);
    // napi_set_named_property(env, exports, "setDebugMode", debug_fn);
    napi_set_named_property(env, exports, "setCacheSize", cache_size_fn);
    // napi_set_named_property(env, exports, "getCacheStats", cache_stats_fn);
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
