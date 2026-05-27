#include <jni.h>
#include <jsi/jsi.h>
#include <string>
#include "../../../../cpp/ShaheenJSI.h"

extern "C" {
    char* rust_mwa_generate_association();
    char* rust_mwa_authorize(const char* cluster);
    char* rust_mwa_sign_transactions(const char* cluster, const char* tx_hex, const char* auth_token);
    void rust_free_string(char* s);
}

extern "C"
JNIEXPORT void JNICALL
Java_com_shaheen_ShaheenModule_nativeInstallJSI(JNIEnv *env, jobject thiz, jlong js_context_pointer) {
    auto runtime = reinterpret_cast<facebook::jsi::Runtime*>(js_context_pointer);
    if (!runtime) return;

    auto genAssoc = facebook::jsi::Function::createFromHostFunction(
        *runtime,
        facebook::jsi::PropNameID::forAscii(*runtime, "shaheenGenerateAssociationSync"),
        0,
        [](facebook::jsi::Runtime &rt, const facebook::jsi::Value &thisVal, const facebook::jsi::Value *args, size_t count) -> facebook::jsi::Value {
            return facebook::react::ShaheenJSI::generateAssociationMwa(rt);
        }
    );
    runtime->global().setProperty(*runtime, "shaheenGenerateAssociationSync", std::move(genAssoc));

    auto authorize = facebook::jsi::Function::createFromHostFunction(
        *runtime,
        facebook::jsi::PropNameID::forAscii(*runtime, "shaheenAuthorizeSync"),
        1,
        [](facebook::jsi::Runtime &rt, const facebook::jsi::Value &thisVal, const facebook::jsi::Value *args, size_t count) -> facebook::jsi::Value {
            if (count < 1) return facebook::jsi::Value(false);
            return facebook::react::ShaheenJSI::authorizeMwa(rt, args[0]);
        }
    );
    runtime->global().setProperty(*runtime, "shaheenAuthorizeSync", std::move(authorize));

    auto sign = facebook::jsi::Function::createFromHostFunction(
        *runtime,
        facebook::jsi::PropNameID::forAscii(*runtime, "shaheenSignTransactionsSync"),
        3,
        [](facebook::jsi::Runtime &rt, const facebook::jsi::Value &thisVal, const facebook::jsi::Value *args, size_t count) -> facebook::jsi::Value {
            if (count < 3) return facebook::jsi::Value(false);
            return facebook::react::ShaheenJSI::signTransactionsMwa(rt, args[0], args[1], args[2]);
        }
    );
    runtime->global().setProperty(*runtime, "shaheenSignTransactionsSync", std::move(sign));
}

extern "C"
JNIEXPORT jstring JNICALL
Java_com_shaheen_ShaheenModule_nativeGenerateAssociation(JNIEnv *env, jobject thiz) {
    char *nativeRes = rust_mwa_generate_association();
    jstring result = env->NewStringUTF(nativeRes);
    rust_free_string(nativeRes);
    return result;
}

extern "C"
JNIEXPORT jstring JNICALL
Java_com_shaheen_ShaheenModule_nativeAuthorize(JNIEnv *env, jobject thiz, jstring cluster) {
    const char *cluster_str = env->GetStringUTFChars(cluster, nullptr);
    char *nativeRes = rust_mwa_authorize(cluster_str);
    env->ReleaseStringUTFChars(cluster, cluster_str);
    
    jstring result = env->NewStringUTF(nativeRes);
    rust_free_string(nativeRes);
    return result;
}

extern "C"
JNIEXPORT jstring JNICALL
Java_com_shaheen_ShaheenModule_nativeSignTransactions(JNIEnv *env, jobject thiz, jstring cluster, jstring tx_hex, jstring auth_token) {
    const char *cluster_str = env->GetStringUTFChars(cluster, nullptr);
    const char *tx_hex_str = env->GetStringUTFChars(tx_hex, nullptr);
    const char *auth_token_str = env->GetStringUTFChars(auth_token, nullptr);

    char *nativeRes = rust_mwa_sign_transactions(cluster_str, tx_hex_str, auth_token_str);

    env->ReleaseStringUTFChars(cluster, cluster_str);
    env->ReleaseStringUTFChars(tx_hex, tx_hex_str);
    env->ReleaseStringUTFChars(auth_token, auth_token_str);

    jstring result = env->NewStringUTF(nativeRes);
    rust_free_string(nativeRes);
    return result;
}
