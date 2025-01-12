#include <list>
#include <unordered_map>
#include <assert.h>
#include <string>
#include <stdio.h>
#include <string.h>
#include "src/binding.h"


struct err_data {
    char buf[4096]; 
};
void throw_err_cb(void* data, jv msg) {
    struct err_data* err_data = static_cast<struct err_data*>(data);

    if (jv_get_kind(msg) != JV_KIND_STRING) {
        msg = jv_dump_string(msg, JV_PRINT_INVALID);
    }

    snprintf(err_data->buf, sizeof(err_data->buf), "aa%s", jv_string_value(msg));
    jv_free(msg);
}

template <class KEY_T, class VAL_T> class LRUCache {
private:
    std::list<std::pair<KEY_T, VAL_T>> item_list;
    std::unordered_map<KEY_T, decltype(item_list.begin())> item_map;
    size_t cache_size;

    void clean() {
        while (item_map.size() > cache_size) {
            auto last_it = item_list.end();
            last_it--;
            item_map.erase(last_it->first);
            item_list.pop_back();
            jq_teardown(&last_it->second);
        }
    }

public:
    LRUCache(int cache_size_) : cache_size(cache_size_) {}
    void put(const KEY_T &key, const VAL_T &val) {
        auto it = item_map.find(key);
        if (it != item_map.end()) {
            item_list.erase(it->second);
            item_map.erase(it);
        }
        item_list.push_front(std::make_pair(key, val));
        item_map.insert(std::make_pair(key, item_list.begin()));
        clean();
    }
    bool exist(const KEY_T &key) {
        return (item_map.count(key) > 0);
    }
    VAL_T get(const KEY_T &key) {
        assert(exist(key));
        auto it = item_map.find(key);
        item_list.splice(item_list.begin(), item_list, it->second);
        return it->second->second;
    }
};

LRUCache<std::string, jq_state*> cache(100);

std::string FromNapiString(napi_env env, napi_value value) {
    size_t str_size;
    size_t str_size_out;
    napi_get_value_string_utf8(env, value, nullptr, 0, &str_size);
    char* str = new char[str_size + 1];
    napi_get_value_string_utf8(env, value, str, str_size + 1, &str_size_out);
    std::string result(str);
    delete[] str;
    return result;
}

void jv_object_to_napi(std::string key, napi_env env, jv actual, napi_value ret) {
    jv_kind kind = jv_get_kind(actual);
    napi_value value;

    switch (kind) {
        case JV_KIND_INVALID: {
            jv msg = jv_invalid_get_msg(jv_copy(actual));
            if (jv_get_kind(msg) == JV_KIND_STRING) {
                napi_throw_error(env, nullptr, jv_string_value(msg));
            }
            jv_free(msg);
            break;
        }
        case JV_KIND_NULL: {
            napi_get_null(env, &value);
            break;
        }
        case JV_KIND_TRUE: {
            napi_get_boolean(env, true, &value);
            break;
        }
        case JV_KIND_FALSE: {
            napi_get_boolean(env, false, &value);
            break;
        }
        case JV_KIND_NUMBER: {
            double num = jv_number_value(actual);
            napi_create_double(env, num, &value);
            break;
        }
        case JV_KIND_STRING: {
            napi_create_string_utf8(env, jv_string_value(actual), NAPI_AUTO_LENGTH, &value);
            break;
        }
        case JV_KIND_ARRAY: {
            size_t arr_len = jv_array_length(jv_copy(actual));
            napi_create_array_with_length(env, arr_len, &value);

            for (size_t i = 0; i < arr_len; i++) {
                jv elem = jv_array_get(jv_copy(actual), i);
                jv_object_to_napi(std::to_string(i), env, elem, value);
                jv_free(elem); 
            }
            break;
        }
        case JV_KIND_OBJECT: {
            napi_create_object(env, &value);

            jv_object_foreach(actual, obj_key, obj_value) {
                jv_object_to_napi(jv_string_value(obj_key), env, obj_value, value);
                jv_free(obj_key);
                jv_free(obj_value);
            }
            break;
        }
        default:
            napi_throw_error(env, nullptr, "Unsupported jv type");
            break;
    }

    napi_set_named_property(env, ret, key.c_str(), value);
}




napi_value ExecSync(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    if (argc < 2) {
        napi_throw_type_error(env, nullptr, "Wrong number of arguments. Expected 2.");
        return nullptr;
    }

    std::string json = FromNapiString(env, args[0]);
    std::string filter = FromNapiString(env, args[1]);

    jq_state* jq = nullptr;
    struct err_data err_msg;

    // if (cache.exist(filter)) {
    //     jq = jv_copy(cache.get(filter));
    // } else {
        jq = jq_init();
        jq_set_error_cb(jq, throw_err_cb, &err_msg);
        if (!jq_compile(jq, filter.c_str())) {
            jq_teardown(&jq);

            napi_throw_error(env, nullptr, err_msg.buf);
            return nullptr;
        }
    //     cache.put(filter, jv jv_copy(jq));
    // }

    if (jq == nullptr) {
        napi_throw_error(env, nullptr, "Failed to initialize jq");
        jq_teardown(&jq);

        return nullptr;
    }

    jv input = jv_parse(json.c_str());
    if (!jv_is_valid(input)) {
        jv_free(input);
        napi_throw_error(env, nullptr, "Invalid JSON input");
        jq_teardown(&jq);

        return nullptr;
    }

    jq_start(jq, input, 0);
    jv result = jq_next(jq);

    napi_value ret;
    napi_create_object(env, &ret);

    jv_object_to_napi("value",env,result,ret);
    jv_free(result);
jq_teardown(&jq);
    return ret;
}

struct AsyncWork {
    std::string json;
    std::string filter;
    napi_deferred deferred;
    jv result;
    std::string error;
    bool success;
};

void ExecuteAsync(napi_env env, void* data) {
    AsyncWork* work = static_cast<AsyncWork*>(data);
    jq_state* jq = nullptr;
    struct err_data err_msg;

    // if (cache.exist(work->filter)) {
    //     jq = &jv_copy(cache.get(work->filter));
    // } else {
        jq = jq_init();
        jq_set_error_cb(jq, throw_err_cb, &err_msg);
        if (!jq_compile(jq, work->filter.c_str())) {
            work->error = err_msg.buf;
            work->success = false;
jq_teardown(&jq);

            return;
        }
    //     cache.put(work->filter, jv_copy(jq));
    // }

    jv input = jv_parse(work->json.c_str());
    if (!jv_is_valid(input)) {
        work->error = "Invalid JSON input";
        work->success = false;
jq_teardown(&jq);
        jv_free(input);

        return;
    }

    jq_start(jq, input, 0);
    work->result = jq_next(jq);

    if (!jv_is_valid(work->result)) {
        work->error = "jq execution failed";
        work->success = false;
        return;
    }

    work->success = true;
}


void CompleteAsync(napi_env env, napi_status status, void* data) {
    AsyncWork* work = static_cast<AsyncWork*>(data);

    if (work->success) {
        napi_value ret;
        napi_create_object(env, &ret);

        jv_object_to_napi("value", env, work->result, ret);

        napi_resolve_deferred(env, work->deferred, ret);
    } else {
        napi_value error;
        napi_create_string_utf8(env, work->error.c_str(), NAPI_AUTO_LENGTH, &error);
        napi_reject_deferred(env, work->deferred, error);
    }
        jv_free(work->result);

    delete work; 
}



napi_value ExecAsync(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_value promise;

    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    if (argc < 2) {
        napi_throw_type_error(env, nullptr, "Wrong number of arguments. Expected 2.");
        return nullptr;
    }

    AsyncWork* work = new AsyncWork();
    work->json = FromNapiString(env, args[0]);
    work->filter = FromNapiString(env, args[1]);
    work->success = false;

    napi_create_promise(env, &work->deferred, &promise);

    napi_value resource_name;
    napi_create_string_utf8(env, "ExecAsync", NAPI_AUTO_LENGTH, &resource_name);

    napi_async_work async_work;
    napi_create_async_work(env, nullptr, resource_name, ExecuteAsync, CompleteAsync, work, &async_work);
    napi_queue_async_work(env, async_work);

    return promise;
}

napi_value Init(napi_env env, napi_value exports) {
    napi_value exec_sync, exec_async;

    napi_create_function(env, "execSync", NAPI_AUTO_LENGTH, ExecSync, nullptr, &exec_sync);
    napi_create_function(env, "execAsync", NAPI_AUTO_LENGTH, ExecAsync, nullptr, &exec_async);

    napi_set_named_property(env, exports, "execSync", exec_sync);
    napi_set_named_property(env, exports, "execAsync", exec_async);

    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
