#include "src/binding.h"

void jq_exec(std::string json, std::string filter) {
    jq_state *jq = jq_init();
    // jq_compile(jq, filter.c_str());
    // jv input = jv_parse(json.c_str());
    // jq_start(jq, input, 0);
    // jv actual = jq_next(jq);
    // jq_teardown(&jq);
    // jv_dump(jv_copy(actual), 0);
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

    jq_exec(json, filter);

    info.GetReturnValue().Set(Nan::New("World").ToLocalChecked());
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