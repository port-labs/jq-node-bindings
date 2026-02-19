/**
 * Thin NAPI wrapper for jq with simple LRU cache
 *
 * No mutexes needed - Node.js main thread is single-threaded.
 */

#include <node_api.h>
#include <string>
#include <cstring>
#include <unordered_map>
#include <list>

extern "C" {
    #include "jq.h"
}

// Simple LRU cache for compiled jq filters (no mutex - single threaded)
static size_t g_cache_size = 100;
static std::list<std::string> g_lru_order;
static std::unordered_map<std::string, std::pair<jq_state*, std::list<std::string>::iterator>> g_cache;

static jq_state* cache_get(const std::string& filter) {
    auto it = g_cache.find(filter);
    if (it == g_cache.end()) return nullptr;

    // Move to front (most recently used)
    g_lru_order.erase(it->second.second);
    g_lru_order.push_front(filter);
    it->second.second = g_lru_order.begin();

    return it->second.first;
}

static void cache_put(const std::string& filter, jq_state* jq) {
    // Evict if at capacity
    while (g_cache.size() >= g_cache_size && !g_lru_order.empty()) {
        const std::string& oldest = g_lru_order.back();
        auto it = g_cache.find(oldest);
        if (it != g_cache.end()) {
            jq_teardown(&it->second.first);
            g_cache.erase(it);
        }
        g_lru_order.pop_back();
    }

    // Insert new entry
    g_lru_order.push_front(filter);
    g_cache[filter] = {jq, g_lru_order.begin()};
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
    jv result = jq_next(jq, 5);

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

// Module initialization
napi_value Init(napi_env env, napi_value exports) {
    napi_value exec_sync_fn, set_cache_size_fn;

    napi_create_function(env, "execSync", NAPI_AUTO_LENGTH, ExecSync, nullptr, &exec_sync_fn);
    napi_create_function(env, "setCacheSize", NAPI_AUTO_LENGTH, SetCacheSize, nullptr, &set_cache_size_fn);

    napi_set_named_property(env, exports, "execSync", exec_sync_fn);
    napi_set_named_property(env, exports, "setCacheSize", set_cache_size_fn);

    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
