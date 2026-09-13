package com.shaheen;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ShaheenModule extends ReactContextBaseJavaModule {
    public static final String NAME = "ShaheenModule";

    static {
        System.loadLibrary("shaheen");
    }

    private final ExecutorService executor = Executors.newCachedThreadPool();

    public ShaheenModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return NAME;
    }

    // -----------------------------------------------------------------------
    // MODERN MWA 2.0 SESSION API
    // -----------------------------------------------------------------------

    @ReactMethod
    public void createSession(double port, Promise promise) {
        executor.execute(() -> {
            try {
                String resultJson = nativeCreateSession((int) port);
                JSONObject obj = new JSONObject(resultJson);
                WritableMap map = Arguments.createMap();
                boolean success = obj.optBoolean("success", false);
                map.putBoolean("success", success);
                map.putString("sessionId", obj.optString("sessionId", ""));
                map.putString("uri", obj.optString("uri", ""));
                map.putInt("port", obj.optInt("port", 0));
                map.putString("associationToken", obj.optString("associationToken", ""));
                if (obj.has("errorCode")) {
                    map.putString("errorCode", obj.optString("errorCode", ""));
                }
                if (obj.has("error")) {
                    map.putString("error", obj.optString("error", ""));
                }
                if (!success && obj.has("error")) {
                    String code = obj.optString("errorCode", "SESSION_CREATE_ERROR");
                    promise.reject(code, obj.optString("error", "Failed to create session"));
                    return;
                }
                promise.resolve(map);
            } catch (Exception e) {
                promise.reject("SESSION_CREATE_ERROR", e.getMessage() != null ? e.getMessage() : "Unknown Error");
            }
        });
    }

    private static final int MWA_REQUEST_CODE = 42152;

    @ReactMethod
    public void launchWalletIntent(String uriString, Promise promise) {
        Activity currentActivity = getCurrentActivity();
        if (currentActivity == null) {
            promise.reject("ACTIVITY_NULL", "Cannot launch wallet intent: Current activity is null");
            return;
        }

        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uriString));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            currentActivity.startActivityForResult(intent, MWA_REQUEST_CODE);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("INTENT_LAUNCH_ERROR", e.getMessage() != null ? e.getMessage() : "Failed to launch wallet intent");
        }
    }

    @ReactMethod
    public void connectAndAuthorizeSession(
            String sessionId,
            String wsUrl,
            String chain,
            String authToken,
            String identityName,
            String identityUri,
            String identityIcon,
            Promise promise
    ) {
        executor.execute(() -> {
            try {
                String resultJson = nativeConnectAndAuthorizeSession(
                    sessionId, wsUrl, chain, authToken,
                    identityName, identityUri, identityIcon
                );
                JSONObject obj = new JSONObject(resultJson);
                WritableMap map = Arguments.createMap();
                boolean success = obj.optBoolean("success", false);
                map.putBoolean("success", success);
                map.putString("authToken", obj.optString("authToken", ""));
                map.putString("publicKey", obj.optString("publicKey", ""));
                map.putString("error", obj.optString("error", ""));
                if (obj.has("errorCode")) {
                    map.putString("errorCode", obj.optString("errorCode", ""));
                }

                WritableArray accountsArr = Arguments.createArray();
                if (obj.has("accounts")) {
                    JSONArray jsonAccounts = obj.getJSONArray("accounts");
                    for (int i = 0; i < jsonAccounts.length(); i++) {
                        JSONObject accObj = jsonAccounts.getJSONObject(i);
                        WritableMap accMap = Arguments.createMap();
                        accMap.putString("address", accObj.optString("address", ""));
                        if (accObj.has("display_address")) {
                            accMap.putString("displayAddress", accObj.optString("display_address", ""));
                        }
                        if (accObj.has("label")) {
                            accMap.putString("label", accObj.optString("label", ""));
                        }
                        accountsArr.pushMap(accMap);
                    }
                }
                map.putArray("accounts", accountsArr);

                if (!success && obj.has("error") && !obj.optString("error").isEmpty()) {
                    String code = obj.optString("errorCode", "AUTHORIZE_ERROR");
                    promise.reject(code, obj.optString("error", "Authorization failed"));
                    return;
                }

                promise.resolve(map);
            } catch (Exception e) {
                promise.reject("AUTHORIZE_ERROR", e.getMessage() != null ? e.getMessage() : "Unknown Error");
            }
        });
    }

    @ReactMethod
    public void signAndSend(String sessionId, String txPayloadsJson, Promise promise) {
        executor.execute(() -> {
            try {
                String resultJson = nativeSignAndSend(sessionId, txPayloadsJson);
                JSONObject obj = new JSONObject(resultJson);

                WritableMap map = Arguments.createMap();
                boolean success = obj.optBoolean("success", false);
                map.putBoolean("success", success);
                map.putString("signature", obj.optString("signature", ""));
                map.putString("error", obj.optString("error", ""));
                if (obj.has("errorCode")) {
                    map.putString("errorCode", obj.optString("errorCode", ""));
                }

                WritableArray sigsArr = Arguments.createArray();
                if (obj.has("signatures")) {
                    JSONArray jsonSigs = obj.getJSONArray("signatures");
                    for (int i = 0; i < jsonSigs.length(); i++) {
                        sigsArr.pushString(jsonSigs.getString(i));
                    }
                }
                map.putArray("signatures", sigsArr);

                if (!success && obj.has("error") && !obj.optString("error").isEmpty()) {
                    String code = obj.optString("errorCode", "SIGN_AND_SEND_ERROR");
                    promise.reject(code, obj.optString("error", "Sign and send failed"));
                    return;
                }

                promise.resolve(map);
            } catch (Exception e) {
                promise.reject("SIGN_AND_SEND_ERROR", e.getMessage() != null ? e.getMessage() : "Unknown Error");
            }
        });
    }

    @ReactMethod
    public void signTransactions(String sessionId, String txPayloadsJson, Promise promise) {
        executor.execute(() -> {
            try {
                String resultJson = nativeSignTransactionsSession(sessionId, txPayloadsJson);
                JSONObject obj = new JSONObject(resultJson);

                WritableMap map = Arguments.createMap();
                boolean success = obj.optBoolean("success", false);
                map.putBoolean("success", success);
                map.putString("signedTxBase64", obj.optString("signedTxBase64", ""));
                map.putString("error", obj.optString("error", ""));
                if (obj.has("errorCode")) {
                    map.putString("errorCode", obj.optString("errorCode", ""));
                }

                WritableArray txsArr = Arguments.createArray();
                if (obj.has("signedTxsBase64")) {
                    JSONArray jsonTxs = obj.getJSONArray("signedTxsBase64");
                    for (int i = 0; i < jsonTxs.length(); i++) {
                        txsArr.pushString(jsonTxs.getString(i));
                    }
                }
                map.putArray("signedTxsBase64", txsArr);

                if (!success && obj.has("error") && !obj.optString("error").isEmpty()) {
                    String code = obj.optString("errorCode", "SIGN_TRANSACTIONS_ERROR");
                    promise.reject(code, obj.optString("error", "Sign transactions failed"));
                    return;
                }

                promise.resolve(map);
            } catch (Exception e) {
                promise.reject("SIGN_TRANSACTIONS_ERROR", e.getMessage() != null ? e.getMessage() : "Unknown Error");
            }
        });
    }

    @ReactMethod
    public void signMessages(String sessionId, String addressesJson, String payloadsJson, Promise promise) {
        executor.execute(() -> {
            try {
                String resultJson = nativeSignMessages(sessionId, addressesJson, payloadsJson);
                JSONObject obj = new JSONObject(resultJson);

                WritableMap map = Arguments.createMap();
                boolean success = obj.optBoolean("success", false);
                map.putBoolean("success", success);
                map.putString("signedPayload", obj.optString("signedPayload", ""));
                map.putString("error", obj.optString("error", ""));
                if (obj.has("errorCode")) {
                    map.putString("errorCode", obj.optString("errorCode", ""));
                }

                WritableArray payloadsArr = Arguments.createArray();
                if (obj.has("signedPayloads")) {
                    JSONArray jsonPayloads = obj.getJSONArray("signedPayloads");
                    for (int i = 0; i < jsonPayloads.length(); i++) {
                        payloadsArr.pushString(jsonPayloads.getString(i));
                    }
                }
                map.putArray("signedPayloads", payloadsArr);

                if (!success && obj.has("error") && !obj.optString("error").isEmpty()) {
                    String code = obj.optString("errorCode", "SIGN_MESSAGES_ERROR");
                    promise.reject(code, obj.optString("error", "Sign messages failed"));
                    return;
                }

                promise.resolve(map);
            } catch (Exception e) {
                promise.reject("SIGN_MESSAGES_ERROR", e.getMessage() != null ? e.getMessage() : "Unknown Error");
            }
        });
    }

    @ReactMethod
    public void getCapabilities(String sessionId, Promise promise) {
        executor.execute(() -> {
            try {
                String resultJson = nativeGetCapabilities(sessionId);
                JSONObject obj = new JSONObject(resultJson);

                WritableMap map = Arguments.createMap();
                boolean success = obj.optBoolean("success", false);
                map.putBoolean("success", success);
                map.putString("error", obj.optString("error", ""));
                if (obj.has("errorCode")) {
                    map.putString("errorCode", obj.optString("errorCode", ""));
                }

                if (obj.has("maxTransactionsPerRequest") && !obj.isNull("maxTransactionsPerRequest")) {
                    map.putInt("maxTransactionsPerRequest", obj.optInt("maxTransactionsPerRequest"));
                }
                if (obj.has("maxMessagesPerRequest") && !obj.isNull("maxMessagesPerRequest")) {
                    map.putInt("maxMessagesPerRequest", obj.optInt("maxMessagesPerRequest"));
                }

                WritableArray versionsArr = Arguments.createArray();
                if (obj.has("supportedTransactionVersions")) {
                    JSONArray jsonVersions = obj.getJSONArray("supportedTransactionVersions");
                    for (int i = 0; i < jsonVersions.length(); i++) {
                        versionsArr.pushString(jsonVersions.getString(i));
                    }
                }
                map.putArray("supportedTransactionVersions", versionsArr);

                WritableArray featuresArr = Arguments.createArray();
                if (obj.has("features")) {
                    JSONArray jsonFeatures = obj.getJSONArray("features");
                    for (int i = 0; i < jsonFeatures.length(); i++) {
                        featuresArr.pushString(jsonFeatures.getString(i));
                    }
                }
                map.putArray("features", featuresArr);

                if (!success && obj.has("error") && !obj.optString("error").isEmpty()) {
                    String code = obj.optString("errorCode", "GET_CAPABILITIES_ERROR");
                    promise.reject(code, obj.optString("error", "Get capabilities failed"));
                    return;
                }

                promise.resolve(map);
            } catch (Exception e) {
                promise.reject("GET_CAPABILITIES_ERROR", e.getMessage() != null ? e.getMessage() : "Unknown Error");
            }
        });
    }

    @ReactMethod
    public void deauthorize(String sessionId, Promise promise) {
        executor.execute(() -> {
            try {
                String resultJson = nativeDeauthorize(sessionId);
                JSONObject obj = new JSONObject(resultJson);

                WritableMap map = Arguments.createMap();
                boolean success = obj.optBoolean("success", false);
                map.putBoolean("success", success);
                map.putString("error", obj.optString("error", ""));
                if (obj.has("errorCode")) {
                    map.putString("errorCode", obj.optString("errorCode", ""));
                }

                if (!success && obj.has("error") && !obj.optString("error").isEmpty()) {
                    String code = obj.optString("errorCode", "DEAUTHORIZE_ERROR");
                    promise.reject(code, obj.optString("error", "Deauthorize failed"));
                    return;
                }

                promise.resolve(map);
            } catch (Exception e) {
                promise.reject("DEAUTHORIZE_ERROR", e.getMessage() != null ? e.getMessage() : "Unknown Error");
            }
        });
    }

    @ReactMethod
    public void closeSession(String sessionId, Promise promise) {
        executor.execute(() -> {
            try {
                nativeCloseSession(sessionId);
                promise.resolve(null);
            } catch (Exception e) {
                promise.reject("CLOSE_SESSION_ERROR", e.getMessage() != null ? e.getMessage() : "Unknown Error");
            }
        });
    }

    // Native JNI Declarations
    private native String nativeCreateSession(int port);
    private native String nativeConnectAndAuthorizeSession(
        String sessionId,
        String wsUrl,
        String chain,
        String authToken,
        String identityName,
        String identityUri,
        String identityIcon
    );
    private native String nativeSignAndSend(String sessionId, String txPayloadsJson);
    private native String nativeSignTransactionsSession(String sessionId, String txPayloadsJson);
    private native String nativeSignMessages(String sessionId, String addressesJson, String payloadsJson);
    private native String nativeGetCapabilities(String sessionId);
    private native String nativeDeauthorize(String sessionId);
    private native void nativeCloseSession(String sessionId);
}
