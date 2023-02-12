#include <iostream>
#include <string>
#include "binding.h"
#include "jq.h"
#include "jv.h"

void jq(std::string json, std::string filter) {
    jq_state *jq = jq_init();
    jq_compile(jq, filter.c_str());
    jv input = jv_parse(json.c_str());
    jq_start(jq, input, 0);
    jv actual = jq_next(jq);
    jq_teardown(&jq);
    jv_dump(jv_copy(actual), 0);
}


