#ifndef SRC_BINDING_H_
#define SRC_BINDING_H_

#include <nan.h>
#include <string>
#include "jq.h"
#include "jv.h"

void jq_exec(std::string json, std::string filter);

#endif  // SRC_BINDING_H_
