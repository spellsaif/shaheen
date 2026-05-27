#include "ShaheenJSI.h"
#include <jsi/jsi.h>
#include <string>

extern "C" {
    // Target C-ABI boundary mapping to the compiled Rust crate
    char* rust_mwa_execute(const char* cluster, const char* prog_id, const char* data_hex, const char* keys_json);
    void rust_free_string(char* s);
}

namespace facebook::react {

jsi::Value ShaheenJSI::executeMwaNative(jsi::Runtime& rt, const jsi::Value& cluster, const jsi::Value& instructionObj) {
    if (!cluster.isString() || !instructionObj.isObject()) {
        return jsi::Value(false);
    }

    std::string clusterStr = cluster.asString(rt).utf8(rt);
    jsi::Object obj = instructionObj.asObject(rt);
    
    std::string programId = obj.getProperty(rt, "programId").asString(rt).utf8(rt);
    std::string dataHex = obj.getProperty(rt, "dataHex").asString(rt).utf8(rt);
    
    // Manually parse the keys JSI Array into a clean string layout to preserve zero-copy boundaries
    jsi::Array keysArray = obj.getProperty(rt, "keys").asObject(rt).asArray(rt);
    std::string keysJson = "[";
    for (size_t i = 0; i < keysArray.size(rt); ++i) {
        jsi::Object keyObj = keysArray.getValueAtIndex(rt, i).asObject(rt);
        std::string pubkey = keyObj.getProperty(rt, "pubkey").asString(rt).utf8(rt);
        bool isSigner = keyObj.getProperty(rt, "isSigner").asBool();
        bool isWritable = keyObj.getProperty(rt, "isWritable").asBool();
        
        keysJson += "{\"pubkey\":\"" + pubkey + "\",\"isSigner\":" + (isSigner ? "true" : "false") + ",\"isWritable\":" + (isWritable ? "true" : "false") + "}";
        if (i < keysArray.size(rt) - 1) keysJson += ",";
    }
    keysJson += "]";

    // Fast synchronous execution pointer jump straight into cross-compiled Rust
    char* nativeRes = rust_mwa_execute(clusterStr.c_str(), programId.c_str(), dataHex.c_str(), keysJson.c_str());
    
    jsi::String resultStr = jsi::String::createFromUtf8(rt, nativeRes);
    rust_free_string(nativeRes); // Block heap memory leak points
    
    return resultStr;
}

} // namespace facebook::react
