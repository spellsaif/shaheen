#include <jni.h>
#include <string>

extern "C" {
    // MWA 2.0 session C-ABI
    char* rust_mwa_create_session(unsigned short port);
    char* rust_mwa_connect_and_authorize(
        const char* session_id,
        const char* ws_url,
        const char* chain,
        const char* auth_token,
        const char* identity_name,
        const char* identity_uri,
        const char* identity_icon
    );
    char* rust_mwa_sign_and_send(
        const char* session_id,
        const char* tx_payloads_json
    );
    char* rust_mwa_sign_transactions_session(
        const char* session_id,
        const char* tx_payloads_json
    );
    void rust_mwa_close_session(const char* session_id);
    void rust_free_string(char* s);
}

// ---------------------------------------------------------------------------
// MWA 2.0 SESSION METHODS
// ---------------------------------------------------------------------------

extern "C"
JNIEXPORT jstring JNICALL
Java_com_shaheen_ShaheenModule_nativeCreateSession(JNIEnv *env, jobject thiz, jint port) {
    char *nativeRes = rust_mwa_create_session(static_cast<unsigned short>(port));
    jstring result = env->NewStringUTF(nativeRes);
    rust_free_string(nativeRes);
    return result;
}

extern "C"
JNIEXPORT jstring JNICALL
Java_com_shaheen_ShaheenModule_nativeConnectAndAuthorizeSession(
    JNIEnv *env,
    jobject thiz,
    jstring session_id,
    jstring ws_url,
    jstring chain,
    jstring auth_token,
    jstring identity_name,
    jstring identity_uri,
    jstring identity_icon
) {
    const char *session_id_str = session_id ? env->GetStringUTFChars(session_id, nullptr) : nullptr;
    const char *ws_url_str = ws_url ? env->GetStringUTFChars(ws_url, nullptr) : nullptr;
    const char *chain_str = chain ? env->GetStringUTFChars(chain, nullptr) : nullptr;
    const char *auth_token_str = auth_token ? env->GetStringUTFChars(auth_token, nullptr) : nullptr;
    const char *identity_name_str = identity_name ? env->GetStringUTFChars(identity_name, nullptr) : nullptr;
    const char *identity_uri_str = identity_uri ? env->GetStringUTFChars(identity_uri, nullptr) : nullptr;
    const char *identity_icon_str = identity_icon ? env->GetStringUTFChars(identity_icon, nullptr) : nullptr;

    char *nativeRes = rust_mwa_connect_and_authorize(
        session_id_str,
        ws_url_str,
        chain_str,
        auth_token_str,
        identity_name_str,
        identity_uri_str,
        identity_icon_str
    );

    if (session_id_str) env->ReleaseStringUTFChars(session_id, session_id_str);
    if (ws_url_str) env->ReleaseStringUTFChars(ws_url, ws_url_str);
    if (chain_str) env->ReleaseStringUTFChars(chain, chain_str);
    if (auth_token_str) env->ReleaseStringUTFChars(auth_token, auth_token_str);
    if (identity_name_str) env->ReleaseStringUTFChars(identity_name, identity_name_str);
    if (identity_uri_str) env->ReleaseStringUTFChars(identity_uri, identity_uri_str);
    if (identity_icon_str) env->ReleaseStringUTFChars(identity_icon, identity_icon_str);

    jstring result = env->NewStringUTF(nativeRes);
    rust_free_string(nativeRes);
    return result;
}

extern "C"
JNIEXPORT jstring JNICALL
Java_com_shaheen_ShaheenModule_nativeSignAndSend(
    JNIEnv *env,
    jobject thiz,
    jstring session_id,
    jstring tx_payloads_json
) {
    const char *session_id_str = session_id ? env->GetStringUTFChars(session_id, nullptr) : nullptr;
    const char *tx_payloads_json_str = tx_payloads_json ? env->GetStringUTFChars(tx_payloads_json, nullptr) : nullptr;

    char *nativeRes = rust_mwa_sign_and_send(
        session_id_str,
        tx_payloads_json_str
    );

    if (tx_payloads_json_str) env->ReleaseStringUTFChars(tx_payloads_json, tx_payloads_json_str);
    if (session_id_str) env->ReleaseStringUTFChars(session_id, session_id_str);

    jstring result = env->NewStringUTF(nativeRes);
    rust_free_string(nativeRes);
    return result;
}

extern "C"
JNIEXPORT jstring JNICALL
Java_com_shaheen_ShaheenModule_nativeSignTransactionsSession(
    JNIEnv *env,
    jobject thiz,
    jstring session_id,
    jstring tx_payloads_json
) {
    const char *session_id_str = session_id ? env->GetStringUTFChars(session_id, nullptr) : nullptr;
    const char *tx_payloads_json_str = tx_payloads_json ? env->GetStringUTFChars(tx_payloads_json, nullptr) : nullptr;

    char *nativeRes = rust_mwa_sign_transactions_session(
        session_id_str,
        tx_payloads_json_str
    );

    if (tx_payloads_json_str) env->ReleaseStringUTFChars(tx_payloads_json, tx_payloads_json_str);
    if (session_id_str) env->ReleaseStringUTFChars(session_id, session_id_str);

    jstring result = env->NewStringUTF(nativeRes);
    rust_free_string(nativeRes);
    return result;
}

extern "C"
JNIEXPORT void JNICALL
Java_com_shaheen_ShaheenModule_nativeCloseSession(
    JNIEnv *env,
    jobject thiz,
    jstring session_id
) {
    const char *session_id_str = session_id ? env->GetStringUTFChars(session_id, nullptr) : nullptr;
    rust_mwa_close_session(session_id_str);
    if (session_id_str) env->ReleaseStringUTFChars(session_id, session_id_str);
}
