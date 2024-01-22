#include "src/binding.h"
#include <list>
#include <unordered_map>
#include <assert.h>

using namespace std;

// LRUCache to save filter to the compiled jq_state
template <class KEY_T, class VAL_T> class LRUCache{
private:
        list< pair<KEY_T,VAL_T> > item_list;
        unordered_map<KEY_T, decltype(item_list.begin()) > item_map;
        size_t cache_size;
private:
        void clean(void){
                while(item_map.size()>cache_size){
                        auto last_it = item_list.end(); last_it --;
                        item_map.erase(last_it->first);
                        item_list.pop_back();
                        jq_teardown(&last_it->second);
                }
        };
public:
        LRUCache(int cache_size_):cache_size(cache_size_){
                ;
        };

        void put(const KEY_T &key, const VAL_T &val){
                auto it = item_map.find(key);
                if(it != item_map.end()){
                        item_list.erase(it->second);
                        item_map.erase(it);
                }
                item_list.push_front(make_pair(key,val));
                item_map.insert(make_pair(key, item_list.begin()));
                clean();
        };
        bool exist(const KEY_T &key){
                return (item_map.count(key)>0);
        };
        VAL_T get(const KEY_T &key){
                assert(exist(key));
                auto it = item_map.find(key);
                item_list.splice(item_list.begin(), item_list, it->second);
                return it->second->second;
        };

};

LRUCache<std::string, jq_state*> cache(100);

void jv_object_to_v8(std::string key, jv actual, v8::Local<v8::Object> ret) {
    jv_kind k = jv_get_kind(actual);

    v8::Local<v8::String> v8_key = Nan::New(key).ToLocalChecked();
    v8::Local<v8::Value> v8_val;

    switch (k) {
      case JV_KIND_INVALID: {
          jv msg = jv_invalid_get_msg(jv_copy(actual));
          char err[4096];
          if (jv_get_kind(msg) == JV_KIND_STRING) {
            snprintf(err, sizeof(err), "jq: error: %s", jv_string_value(msg));
            jv_free(msg);
            jv_free(actual);
            Nan::ThrowTypeError(err);
            return;
          }
          jv_free(msg);
          jv_free(actual);
          break;
      }
      case JV_KIND_NULL: {
          v8_val = Nan::Null();
          break;
      }
      case JV_KIND_TRUE: {
          v8_val = Nan::True();
          break;
      }
      case JV_KIND_FALSE: {
          v8_val = Nan::False();
          break;
      }
      case JV_KIND_NUMBER: {
          v8_val = Nan::New(jv_number_value(actual));
          break;
      }
      case JV_KIND_STRING: {
          v8_val = Nan::New(jv_string_value(actual)).ToLocalChecked();
          jv_free(actual);
          break;
      }
      case JV_KIND_ARRAY: {
          v8::Local<v8::Array> ret_arr = Nan::New<v8::Array>();
          for (int i = 0; i < jv_array_length(jv_copy(actual)); i++) {
            jv_object_to_v8(std::to_string(i), jv_array_get(jv_copy(actual), i), ret_arr);
          }
          Nan::Set(ret, v8_key, ret_arr);
          jv_free(actual);
          break;
      }
      case JV_KIND_OBJECT: {
          v8::Local<v8::Object> ret_obj = Nan::New<v8::Object>();
          jv_object_foreach(actual, itr_key, value) {
            jv_object_to_v8(jv_string_value(itr_key), value, ret_obj);
          }
          jv_free(actual);
          Nan::Set(ret, v8_key, ret_obj);
          break;
      }
    }

    if (v8_val.IsEmpty()) {
        return;
    }

    Nan::Set(ret, v8_key, v8_val);
}

struct err_data {
  char buf[4096];
};

void throw_err_cb(void *data, jv msg) {
  struct err_data *err_data = (struct err_data *)data;
  if (jv_get_kind(msg) != JV_KIND_STRING)
    msg = jv_dump_string(msg, JV_PRINT_INVALID);
  if (!strncmp(jv_string_value(msg), "jq: error", sizeof("jq: error") - 1))
    snprintf(err_data->buf, sizeof(err_data->buf), "%s", jv_string_value(msg));
  if (strchr(err_data->buf, '\n'))
    *(strchr(err_data->buf, '\n')) = '\0';
  jv_free(msg);
}

void jq_exec(std::string json, std::string filter,const Nan::FunctionCallbackInfo<v8::Value>& info) {
    jq_state *jq = NULL;
    struct err_data err_msg;

    if (cache.exist(filter)) {
        jq = cache.get(filter);
    } else {
        jq = jq_init();
        jq_set_error_cb(jq, throw_err_cb, &err_msg);
        if (!jq_compile(jq, filter.c_str())) {
            Nan::ThrowTypeError(err_msg.buf);
            return;
        }
        cache.put(filter, jq);
    }

    if (jq == NULL) {
        info.GetReturnValue().Set(Nan::Null());
        return;
    }

    jv input = jv_parse(json.c_str());

    if (!jv_is_valid(input)) {
        info.GetReturnValue().Set(Nan::Null());
        jv_free(input);
        return;
    }

    jq_start(jq, input, 0);
    jv result = jq_next(jq);

    v8::Local<v8::Object> ret = Nan::New<v8::Object>();
    jv_object_to_v8("value", result, ret);

    info.GetReturnValue().Set(ret);
}


std::string FromV8String(v8::Local<v8::String> val) {
    Nan::Utf8String keyUTF8(val);
    return std::string(*keyUTF8);
}

void Exec(const Nan::FunctionCallbackInfo<v8::Value>& info) {
        if (info.Length() < 2) {
            Nan::ThrowTypeError("Wrong number of arguments");
            return;
        }

        if (!info[0]->IsString() || !info[1]->IsString()) {
            Nan::ThrowTypeError("Wrong arguments");
            return;
        }

        std::string json = FromV8String(Nan::To<v8::String>(info[0]).ToLocalChecked());
        std::string filter = FromV8String(Nan::To<v8::String>(info[1]).ToLocalChecked());

        jq_exec(json, filter, info);
}

void Init(v8::Local<v8::Object> exports) {
  v8::Local<v8::Context> context = exports->GetCreationContext().ToLocalChecked();
  (void)exports->Set(context,
                     Nan::New("exec").ToLocalChecked(),
                     Nan::New<v8::FunctionTemplate>(Exec)->GetFunction(context).ToLocalChecked());
}

NODE_MODULE(exec, Init)
