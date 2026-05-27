#pragma once

#include <jsi/jsi.h>
#include <memory>

namespace facebook::react {

class ShaheenJSI {
public:
    static jsi::Value executeMwaNative(jsi::Runtime& rt, const jsi::Value& cluster, const jsi::Value& instructionObj);
};

} // namespace facebook::react
