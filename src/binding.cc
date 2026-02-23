/**
 * Thin NAPI wrapper for jq with thread-local LRU cache
 * Each thread gets its own cache to avoid contention and jq_state sharing
 */

#include <node_api.h>
#include <string>
#include <cstring>
#include <unordered_map>
#include <list>

extern "C" {
    #include "jq.h"
}

// Thread-local LRU cache - each thread has its own cache
struct ThreadLocalCache {
    size_t cache_size = 100;
    std::list<std::string> lru_order;
    std::unordered_map<std::string, std::pair<jq_state*, std::list<std::string>::iterator>> cache;

    ~ThreadLocalCache() {
        for (auto& entry : cache) {
            jq_teardown(&entry.second.first);
        }
    }

    jq_state* get(const std::string& filter) {
        auto it = cache.find(filter);
        if (it == cache.end()) return nullptr;

        // Move to front (most recently used)
        lru_order.erase(it->second.second);
        lru_order.push_front(filter);
        it->second.second = lru_order.begin();

        return it->second.first;
    }

    void put(const std::string& filter, jq_state* jq) {
        // Evict if at capacity
        while (cache.size() >= cache_size && !lru_order.empty()) {
            const std::string& oldest = lru_order.back();
            auto it = cache.find(oldest);
            if (it != cache.end()) {
                jq_teardown(&it->second.first);
                cache.erase(it);
            }
            lru_order.pop_back();
        }

        // Insert new entry
        lru_order.push_front(filter);
        cache[filter] = {jq, lru_order.begin()};
    }
};

static thread_local ThreadLocalCache t_cache;
static size_t g_cache_size = 100;  // Global default for new threads

static jq_state* cache_get(const std::string& filter) {
    return t_cache.get(filter);
}

static void cache_put(const std::string& filter, jq_state* jq) {
    t_cache.put(filter, jq);
}

// Error callback data structure
struct ErrorData {
    char buf[4096];
    ErrorData() { buf[0] = '\0'; }
};

// Error callback - keep only first (most detailed) error
static void error_callback(void* data, jv msg) {
    ErrorData* err = static_cast<ErrorData*>(data);
    if (err->buf[0] != '\0') {
        jv_free(msg);
        return;
    }

    if (jv_get_kind(msg) != JV_KIND_STRING) {
        msg = jv_dump_string(msg, JV_PRINT_INVALID);
    }
    const char* str = jv_string_value(msg);
    if (strncmp(str, "jq: error", 9) == 0) {
        snprintf(err->buf, sizeof(err->buf), "jq: compile error%s", str + 9);
    } else {
        snprintf(err->buf, sizeof(err->buf), "%s", str);
    }
    char* nl = strchr(err->buf, '\n');
    if (nl) *nl = '\0';
    jv_free(msg);
}

// Helper: Get string from NAPI value
static std::string napi_to_string(napi_env env, napi_value value) {
    size_t len;
    napi_get_value_string_utf8(env, value, nullptr, 0, &len);
    std::string result(len, '\0');
    napi_get_value_string_utf8(env, value, &result[0], len + 1, &len);
    return result;
}

// Convert jv to NAPI value (recursive)
static napi_value jv_to_napi(napi_env env, jv value, std::string& error_out) {
    napi_value result;
    jv_kind kind = jv_get_kind(value);

    switch (kind) {
        case JV_KIND_INVALID: {
            jv msg = jv_invalid_get_msg(jv_copy(value));
            if (jv_get_kind(msg) == JV_KIND_STRING) {
                error_out = std::string("jq: error: ") + jv_string_value(msg);
                jv_free(msg);
                return nullptr;
            }
            jv_free(msg);
            napi_get_undefined(env, &result);
            break;
        }
        case JV_KIND_NULL:
            napi_get_null(env, &result);
            break;
        case JV_KIND_FALSE:
            napi_get_boolean(env, false, &result);
            break;
        case JV_KIND_TRUE:
            napi_get_boolean(env, true, &result);
            break;
        case JV_KIND_NUMBER:
            napi_create_double(env, jv_number_value(value), &result);
            break;
        case JV_KIND_STRING:
            napi_create_string_utf8(env, jv_string_value(value), NAPI_AUTO_LENGTH, &result);
            break;
        case JV_KIND_ARRAY: {
            size_t len = jv_array_length(jv_copy(value));
            napi_create_array_with_length(env, len, &result);
            for (size_t i = 0; i < len; i++) {
                jv elem = jv_array_get(jv_copy(value), i);
                napi_value napi_elem = jv_to_napi(env, elem, error_out);
                jv_free(elem);
                if (!error_out.empty()) return nullptr;
                napi_set_element(env, result, i, napi_elem);
            }
            break;
        }
        case JV_KIND_OBJECT: {
            napi_create_object(env, &result);
            int iter = jv_object_iter(value);
            while (jv_object_iter_valid(value, iter)) {
                jv key = jv_object_iter_key(value, iter);
                jv val = jv_object_iter_value(value, iter);
                napi_value napi_val = jv_to_napi(env, val, error_out);
                jv_free(val);
                if (!error_out.empty()) {
                    jv_free(key);
                    return nullptr;
                }
                napi_set_named_property(env, result, jv_string_value(key), napi_val);
                jv_free(key);
                iter = jv_object_iter_next(value, iter);
            }
            break;
        }
        default:
            napi_get_undefined(env, &result);
            break;
    }
    return result;
}

// ExecSync: Synchronous jq execution with caching
napi_value ExecSync(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    if (argc < 2) {
        napi_throw_type_error(env, nullptr, "Expected 2 arguments: json string and filter string");
        return nullptr;
    }

    std::string json = napi_to_string(env, args[0]);
    std::string filter = napi_to_string(env, args[1]);

    if (json.empty()) {
        napi_throw_error(env, nullptr, "Invalid JSON input");
        return nullptr;
    }
    if (filter.empty()) {
        napi_throw_error(env, nullptr, "Invalid filter input");
        return nullptr;
    }

    // Try to get from cache
    jq_state* jq = cache_get(filter);
    bool from_cache = (jq != nullptr);

    if (!jq) {
        // Compile new filter
        ErrorData err;
        jq = jq_init();
        if (!jq) {
            napi_throw_error(env, nullptr, "Failed to initialize jq");
            return nullptr;
        }
        jq_set_error_cb(jq, error_callback, &err);

        if (!jq_compile(jq, filter.c_str())) {
            std::string msg = err.buf[0] ? err.buf : "jq: compile error";
            jq_teardown(&jq);
            napi_throw_error(env, nullptr, msg.c_str());
            return nullptr;
        }

        // Add to cache
        cache_put(filter, jq);
    }

    // Parse input JSON
    jv input = jv_parse(json.c_str());
    if (!jv_is_valid(input)) {
        jv_free(input);
        napi_throw_error(env, nullptr, "Invalid JSON input");
        return nullptr;
    }

    // Execute
    jq_start(jq, input, 0);
    jv result = jq_next(jq);

    // Convert result
    std::string error_msg;
    napi_value napi_result = jv_to_napi(env, result, error_msg);
    jv_free(result);

    if (!error_msg.empty()) {
        napi_throw_error(env, nullptr, error_msg.c_str());
        return nullptr;
    }

    // Wrap in { value: ... }
    napi_value ret;
    napi_create_object(env, &ret);
    napi_set_named_property(env, ret, "value", napi_result);

    return ret;
}

// SetCacheSize: Configure cache size
napi_value SetCacheSize(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    if (argc >= 1) {
        int64_t size;
        if (napi_get_value_int64(env, args[0], &size) == napi_ok && size > 0) {
            g_cache_size = static_cast<size_t>(size);
        }
    }

    napi_value result;
    napi_create_int64(env, g_cache_size, &result);
    return result;
}

// ============================================================================
// Async Work Implementation
// Uses N-API async work to run jq on libuv thread pool
// ============================================================================

struct AsyncWorkData {
    // Input
    std::string json;
    std::string filter;

    // N-API handles
    napi_deferred deferred;
    napi_async_work work;
    napi_env env;  // Only valid in complete callback

    // Output (set in execute callback)
    jv result;
    std::string error_msg;
    bool success;

    AsyncWorkData() : result(jv_invalid()), success(false) {}
    ~AsyncWorkData() {
        if (jv_get_kind(result) != JV_KIND_INVALID || jv_is_valid(result)) {
            jv_free(result);
        }
    }
};

// Execute callback - runs on libuv worker thread
// IMPORTANT: napi_env is NOT usable here - no N-API calls allowed
static void async_execute(napi_env env, void* data) {
    AsyncWorkData* work_data = static_cast<AsyncWorkData*>(data);

    // Parse input JSON
    jv input = jv_parse(work_data->json.c_str());
    if (!jv_is_valid(input)) {
        jv_free(input);
        work_data->error_msg = "Invalid JSON input";
        work_data->success = false;
        return;
    }

    // Try to get from thread-local cache
    jq_state* jq = cache_get(work_data->filter);
    bool from_cache = (jq != nullptr);

    if (!jq) {
        // Compile new filter
        ErrorData err;
        jq = jq_init();
        if (!jq) {
            jv_free(input);
            work_data->error_msg = "Failed to initialize jq";
            work_data->success = false;
            return;
        }
        jq_set_error_cb(jq, error_callback, &err);

        if (!jq_compile(jq, work_data->filter.c_str())) {
            work_data->error_msg = err.buf[0] ? err.buf : "jq: compile error";
            jq_teardown(&jq);
            jv_free(input);
            work_data->success = false;
            return;
        }

        // Add to thread-local cache
        cache_put(work_data->filter, jq);
    }

    // Execute jq
    jq_start(jq, input, 0);
    work_data->result = jq_next(jq);
    work_data->success = true;
}

// Complete callback - runs on main thread, napi_env IS valid here
static void async_complete(napi_env env, napi_status status, void* data) {
    AsyncWorkData* work_data = static_cast<AsyncWorkData*>(data);

    if (status == napi_cancelled) {
        // Work was cancelled
        napi_value error;
        napi_create_string_utf8(env, "Operation cancelled", NAPI_AUTO_LENGTH, &error);
        napi_reject_deferred(env, work_data->deferred, error);
    } else if (!work_data->success) {
        // Execution failed
        napi_value error;
        napi_create_string_utf8(env, work_data->error_msg.c_str(), NAPI_AUTO_LENGTH, &error);
        napi_reject_deferred(env, work_data->deferred, error);
    } else {
        // Convert jv result to napi_value
        std::string error_msg;
        napi_value napi_result = jv_to_napi(env, work_data->result, error_msg);

        if (!error_msg.empty()) {
            napi_value error;
            napi_create_string_utf8(env, error_msg.c_str(), NAPI_AUTO_LENGTH, &error);
            napi_reject_deferred(env, work_data->deferred, error);
        } else {
            // Wrap in { value: ... } like sync version
            napi_value ret;
            napi_create_object(env, &ret);
            napi_set_named_property(env, ret, "value", napi_result);
            napi_resolve_deferred(env, work_data->deferred, ret);
        }
    }

    // Clean up
    napi_delete_async_work(env, work_data->work);
    delete work_data;
}

// ExecAsync: Asynchronous jq execution using N-API async work
napi_value ExecAsync(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    if (argc < 2) {
        napi_throw_type_error(env, nullptr, "Expected 2 arguments: json string and filter string");
        return nullptr;
    }

    std::string json = napi_to_string(env, args[0]);
    std::string filter = napi_to_string(env, args[1]);

    if (json.empty()) {
        napi_throw_error(env, nullptr, "Invalid JSON input");
        return nullptr;
    }
    if (filter.empty()) {
        napi_throw_error(env, nullptr, "Invalid filter input");
        return nullptr;
    }

    // Create async work data
    AsyncWorkData* work_data = new AsyncWorkData();
    work_data->json = std::move(json);
    work_data->filter = std::move(filter);
    work_data->env = env;

    // Create promise
    napi_value promise;
    napi_create_promise(env, &work_data->deferred, &promise);

    // Create async work
    napi_value resource_name;
    napi_create_string_utf8(env, "jq_exec_async", NAPI_AUTO_LENGTH, &resource_name);

    napi_status create_status = napi_create_async_work(
        env,
        nullptr,  // async_resource
        resource_name,
        async_execute,
        async_complete,
        work_data,
        &work_data->work
    );

    if (create_status != napi_ok) {
        delete work_data;
        napi_throw_error(env, nullptr, "Failed to create async work");
        return nullptr;
    }

    // Queue the work
    napi_status queue_status = napi_queue_async_work(env, work_data->work);
    if (queue_status != napi_ok) {
        napi_delete_async_work(env, work_data->work);
        delete work_data;
        napi_throw_error(env, nullptr, "Failed to queue async work");
        return nullptr;
    }

    return promise;
}

// Module initialization
napi_value Init(napi_env env, napi_value exports) {
    napi_value exec_sync_fn, exec_async_fn, set_cache_size_fn;

    napi_create_function(env, "execSync", NAPI_AUTO_LENGTH, ExecSync, nullptr, &exec_sync_fn);
    napi_create_function(env, "execAsync", NAPI_AUTO_LENGTH, ExecAsync, nullptr, &exec_async_fn);
    napi_create_function(env, "setCacheSize", NAPI_AUTO_LENGTH, SetCacheSize, nullptr, &set_cache_size_fn);

    napi_set_named_property(env, exports, "execSync", exec_sync_fn);
    napi_set_named_property(env, exports, "execAsync", exec_async_fn);
    napi_set_named_property(env, exports, "setCacheSize", set_cache_size_fn);

    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
