#include <jni.h>
#include <jsi/jsi.h>
#include <string>
#include "../../../../cpp/ShaheenJSI.h"

extern "C" {
    char* rust_mwa_execute(const char* cluster, const char* prog_id, const char* data_hex, const char* keys_json);
    void rust_free_string(char* s);
}

extern "C"
JNIEXPORT void JNICALL
Java_com_shaheen_ShaheenModule_nativeInstallJSI(JNIEnv *env, jobject thiz, jlong js_context_pointer) {
    auto runtime = reinterpret_cast<facebook::jsi::Runtime*>(js_context_pointer);
    if (!runtime) return;

    auto executeMwa = facebook::jsi::Function::createFromHostFunction(
        *runtime,
        facebook::jsi::PropNameID::forAscii(*runtime, "shaheenExecuteSync"),
        2,
        [](facebook::jsi::Runtime &rt, const facebook::jsi::Value &thisVal, const facebook::jsi::Value *args, size_t count) -> facebook::jsi::Value {
            if (count < 2) {
                return facebook::jsi::Value(false);
            }
            return facebook::react::ShaheenJSI::executeMwaNative(rt, args[0], args[1]);
        }
    );
    runtime->global().setProperty(*runtime, "shaheenExecuteSync", std::move(executeMwa));
}

extern "C"
JNIEXPORT jstring JNICALL
Java_com_shaheen_ShaheenModule_nativeExecuteMwa(JNIEnv *env, jobject thiz, jstring cluster, jstring program_id, jstring data_hex, jstring keys_json) {
    const char *cluster_str = env->GetStringUTFChars(cluster, nullptr);
    const char *program_id_str = env->GetStringUTFChars(program_id, nullptr);
    const char *data_hex_str = env->GetStringUTFChars(data_hex, nullptr);
    const char *keys_json_str = env->GetStringUTFChars(keys_json, nullptr);

    char *nativeRes = rust_mwa_execute(cluster_str, program_id_str, data_hex_str, keys_json_str);

    env->ReleaseStringUTFChars(cluster, cluster_str);
    env->ReleaseStringUTFChars(program_id, program_id_str);
    env->ReleaseStringUTFChars(data_hex, data_hex_str);
    env->ReleaseStringUTFChars(keys_json, keys_json_str);

    jstring result = env->NewStringUTF(nativeRes);
    rust_free_string(nativeRes);

    return result;
}
