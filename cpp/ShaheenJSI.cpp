#include "ShaheenJSI.h"
#include <jsi/jsi.h>
#include <string>

extern "C" {
    char* rust_mwa_generate_association();
    char* rust_mwa_authorize(const char* cluster);
    char* rust_mwa_sign_transactions(const char* cluster, const char* tx_hex, const char* auth_token);
    void rust_free_string(char* s);
}

namespace facebook::react {

jsi::Value ShaheenJSI::generateAssociationMwa(jsi::Runtime& rt) {
    char* nativeRes = rust_mwa_generate_association();
    jsi::String resultStr = jsi::String::createFromUtf8(rt, nativeRes);
    rust_free_string(nativeRes);
    return resultStr;
}

jsi::Value ShaheenJSI::authorizeMwa(jsi::Runtime& rt, const jsi::Value& cluster) {
    if (!cluster.isString()) {
        return jsi::Value(false);
    }
    std::string clusterStr = cluster.asString(rt).utf8(rt);
    
    char* nativeRes = rust_mwa_authorize(clusterStr.c_str());
    jsi::String resultStr = jsi::String::createFromUtf8(rt, nativeRes);
    rust_free_string(nativeRes);
    return resultStr;
}

jsi::Value ShaheenJSI::signTransactionsMwa(jsi::Runtime& rt, const jsi::Value& cluster, const jsi::Value& txHex, const jsi::Value& authToken) {
    if (!cluster.isString() || !txHex.isString() || !authToken.isString()) {
        return jsi::Value(false);
    }
    std::string clusterStr = cluster.asString(rt).utf8(rt);
    std::string txHexStr = txHex.asString(rt).utf8(rt);
    std::string authTokenStr = authToken.asString(rt).utf8(rt);
    
    char* nativeRes = rust_mwa_sign_transactions(clusterStr.c_str(), txHexStr.c_str(), authTokenStr.c_str());
    jsi::String resultStr = jsi::String::createFromUtf8(rt, nativeRes);
    rust_free_string(nativeRes);
    return resultStr;
}

} // namespace facebook::react
