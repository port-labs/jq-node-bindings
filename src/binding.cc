/**
 * Thin NAPI wrapper for jq
 *
 * This is a minimal binding that exposes jq's C API to Node.js.
 * All threading and caching is handled in the JavaScript layer.
 */

#include <node_api.h>
#include <string>
#include <cstring>

extern "C" {
    #include "jq.h"
}

// Error callback data structure
struct ErrorData {
    char buf[4096];
    ErrorData() { buf[0] = '\0'; }
};

// Error callback for jq compilation errors
// jq may call this multiple times - once with detailed error, then with summary
// We keep only the first (most detailed) error message
static void error_callback(void* data, jv msg) {
    ErrorData* err = static_cast<ErrorData*>(data);

    // Only capture if buffer is empty (first error)
    if (err->buf[0] != '\0') {
        jv_free(msg);
        return;
    }

    if (jv_get_kind(msg) != JV_KIND_STRING) {
        msg = jv_dump_string(msg, JV_PRINT_INVALID);
    }
    const char* str = jv_string_value(msg);
    // jq sends "jq: error: ..." for compile errors, we convert to "jq: compile error: ..."
    if (strncmp(str, "jq: error", 9) == 0) {
        snprintf(err->buf, sizeof(err->buf), "jq: compile error%s", str + 9);
    } else {
        snprintf(err->buf, sizeof(err->buf), "%s", str);
    }
    // Remove trailing newline
    char* nl = strchr(err->buf, '\n');
    if (nl) *nl = '\0';
    jv_free(msg);
}

// Helper: Check NAPI status and throw if error
static inline bool check_status(napi_env env, napi_status status, const char* msg) {
    if (status != napi_ok) {
        napi_throw_error(env, nullptr, msg);
        return false;
    }
    return true;
}

// Helper: Get string from NAPI value
static std::string napi_to_string(napi_env env, napi_value value) {
    size_t len;
    napi_get_value_string_utf8(env, value, nullptr, 0, &len);
    std::string result(len, '\0');
    napi_get_value_string_utf8(env, value, &result[0], len + 1, &len);
    return result;
}

// Convert jv value to NAPI value (recursive)
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

// ExecSync: Synchronous jq execution
// Args: (jsonString, filterString)
// Returns: { value: result }
napi_value ExecSync(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    if (argc < 2) {
        napi_throw_type_error(env, nullptr, "Expected 2 arguments: json string and filter string");
        return nullptr;
    }

    // Get arguments
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

    // Initialize jq
    ErrorData err;
    jq_state* jq = jq_init();
    if (!jq) {
        napi_throw_error(env, nullptr, "Failed to initialize jq");
        return nullptr;
    }
    jq_set_error_cb(jq, error_callback, &err);

    // Compile filter
    if (!jq_compile(jq, filter.c_str())) {
        std::string msg = err.buf[0] ? err.buf : "jq: compile error";
        jq_teardown(&jq);
        napi_throw_error(env, nullptr, msg.c_str());
        return nullptr;
    }

    // Parse input JSON
    jv input = jv_parse(json.c_str());
    if (!jv_is_valid(input)) {
        jv_free(input);
        jq_teardown(&jq);
        napi_throw_error(env, nullptr, "Invalid JSON input");
        return nullptr;
    }

    // Execute filter (5 second timeout)
    jq_start(jq, input, 0);
    jv result = jq_next(jq, 5);

    // Convert result to NAPI
    std::string error_msg;
    napi_value napi_result = jv_to_napi(env, result, error_msg);
    jv_free(result);
    jq_teardown(&jq);

    if (!error_msg.empty()) {
        napi_throw_error(env, nullptr, error_msg.c_str());
        return nullptr;
    }

    // Wrap in { value: ... } for backwards compatibility
    napi_value ret;
    napi_create_object(env, &ret);
    napi_set_named_property(env, ret, "value", napi_result);

    return ret;
}

// SetCacheSize: No-op for backwards compatibility
// The JavaScript layer handles caching now
napi_value SetCacheSize(napi_env env, napi_callback_info info) {
    napi_value result;
    napi_create_int64(env, 0, &result);
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
