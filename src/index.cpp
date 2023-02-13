#include <string>
#include "src/binding.h"

class Jq : public Nan::ObjectWrap {
 public:
    static NAN_MODULE_INIT(Init);

 private:
    explicit Jq(std::string json, std::string filter);
    ~Jq();

    static NAN_METHOD(New);
    static NAN_METHOD(Exec);
    static Nan::Persistent<v8::Function> constructor;
    std::string json;
    std::string filter;
};

NAN_METHOD(Jq::New) {
    if (info.IsConstructCall()) {
        // Invoked as constructor: `new Jq(...)`
        std::string json = (std::string) *Nan::Utf8String(info[0]);
        std::string filter = (std::string) *Nan::Utf8String(info[1]);
        Jq* obj = new Jq(json, filter);
        obj->Wrap(info.This());
        info.GetReturnValue().Set(info.This());
    }
}

NAN_METHOD(Jq::Exec) {
    Jq* obj = ObjectWrap::Unwrap<Jq>(info.Holder());
    std::string json = obj->json;
    std::string filter = obj->filter;
    jq_exec(json, filter);
}
