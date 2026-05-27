#pragma once

#include <jsi/jsi.h>
#include <memory>

namespace facebook::react {

class ShaheenJSI {
public:
    static jsi::Value generateAssociationMwa(jsi::Runtime& rt);
    static jsi::Value authorizeMwa(jsi::Runtime& rt, const jsi::Value& cluster);
    static jsi::Value signTransactionsMwa(jsi::Runtime& rt, const jsi::Value& cluster, const jsi::Value& txHex, const jsi::Value& authToken);
};

} // namespace facebook::react
