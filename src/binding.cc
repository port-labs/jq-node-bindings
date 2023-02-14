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

LRUCache<std::string, jq_state*> cache(5);

std::string jq_exec(std::string json, std::string filter) {
    jq_state *jq = NULL;

    if (cache.exist(filter)) {
        jq = cache.get(filter);
    } else {
        jq = jq_init();
        jq_compile(jq, filter.c_str());
        cache.put(filter, jq);
    }

    jv input = jv_parse(json.c_str());
    jq_start(jq, input, 0);
    jv actual = jq_next(jq);

    std::string result = jv_string_value(actual);

    return result;
}

std::string FromV8String(v8::Local<v8::String> val) {
    Nan::Utf8String keyUTF8(val);
    return std::string(*keyUTF8);
}

void Exec(const Nan::FunctionCallbackInfo<v8::Value>& info) {
    v8::Local<v8::Context> context = info.GetIsolate()->GetCurrentContext();

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

    std::string result = jq_exec(json, filter);

    info.GetReturnValue().Set(Nan::New(result).ToLocalChecked());
}

void Init(v8::Local<v8::Object> exports) {
  v8::Local<v8::Context> context = exports->CreationContext();
  exports->Set(context,
               Nan::New("exec").ToLocalChecked(),
               Nan::New<v8::FunctionTemplate>(Exec)
                   ->GetFunction(context)
                   .ToLocalChecked());
}

NODE_MODULE(exec, Init)