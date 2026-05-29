#include <jni.h>
#include <string>

extern "C" {
    char* rust_mwa_generate_association();
    char* rust_mwa_authorize(const char* cluster);
    char* rust_mwa_sign_transactions(const char* cluster, const char* tx_hex, const char* auth_token);
    void rust_free_string(char* s);
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
