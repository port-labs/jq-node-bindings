#include <napi.h>
#include <string>
#include "jq.h"
#include "jv.h"
#include "binding.h"

Napi::String execute(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    std::string json = (std::string) info[0].ToString();
    std::string filter = (std::string) info[1].ToString();
    jq( json, filter );

    return Napi::String::New(env, "Hello World");
}

// callback method when module is registered with Node.js
Napi::Object Init(Napi::Env env, Napi::Object exports) {

    // set a key on `exports` object
    exports.Set(
        Napi::String::New(env, "execute"), 
        Napi::Function::New(env, execute) 
    );

    return exports;
}

NODE_API_MODULE(jq, Init)