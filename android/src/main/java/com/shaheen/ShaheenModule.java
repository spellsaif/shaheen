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

public class ShaheenModule extends ReactContextBaseJavaModule {
    static {
        System.loadLibrary("shaheen");
    }

    public ShaheenModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "ShaheenModule";
    }

    // -----------------------------------------------------------------------
    // MODERN MWA 2.0 SESSION API
    // -----------------------------------------------------------------------

    @ReactMethod
    public void createSession(double port, Promise promise) {
        new Thread(() -> {
            try {
                String resultJson = nativeCreateSession((int) port);
                JSONObject obj = new JSONObject(resultJson);
                WritableMap map = Arguments.createMap();
                map.putBoolean("success", obj.optBoolean("success", false));
                map.putString("sessionId", obj.optString("sessionId", ""));
                map.putString("uri", obj.optString("uri", ""));
                map.putInt("port", obj.optInt("port", 0));
                map.putString("associationToken", obj.optString("associationToken", ""));
                if (obj.has("error")) {
                    map.putString("error", obj.optString("error", ""));
                }
                promise.resolve(map);
            } catch (Exception e) {
                promise.reject("SESSION_CREATE_ERROR", e.getMessage() != null ? e.getMessage() : "Unknown Error");
            }
        }).start();
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
        new Thread(() -> {
            try {
                String resultJson = nativeConnectAndAuthorizeSession(
                    sessionId, wsUrl, chain, authToken,
                    identityName, identityUri, identityIcon
                );
                JSONObject obj = new JSONObject(resultJson);
                WritableMap map = Arguments.createMap();
                map.putBoolean("success", obj.optBoolean("success", false));
                map.putString("authToken", obj.optString("authToken", ""));
                map.putString("publicKey", obj.optString("publicKey", ""));
                map.putString("error", obj.optString("error", ""));

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

                promise.resolve(map);
            } catch (Exception e) {
                promise.reject("AUTHORIZE_ERROR", e.getMessage() != null ? e.getMessage() : "Unknown Error");
            }
        }).start();
    }

    @ReactMethod
    public void signAndSend(String sessionId, String txPayloadsJson, Promise promise) {
        new Thread(() -> {
            try {
                String resultJson = nativeSignAndSend(sessionId, txPayloadsJson);
                JSONObject obj = new JSONObject(resultJson);

                WritableMap map = Arguments.createMap();
                map.putBoolean("success", obj.optBoolean("success", false));
                map.putString("signature", obj.optString("signature", ""));
                map.putString("error", obj.optString("error", ""));

                WritableArray sigsArr = Arguments.createArray();
                if (obj.has("signatures")) {
                    JSONArray jsonSigs = obj.getJSONArray("signatures");
                    for (int i = 0; i < jsonSigs.length(); i++) {
                        sigsArr.pushString(jsonSigs.getString(i));
                    }
                }
                map.putArray("signatures", sigsArr);

                promise.resolve(map);
            } catch (Exception e) {
                promise.reject("SIGN_AND_SEND_ERROR", e.getMessage() != null ? e.getMessage() : "Unknown Error");
            }
        }).start();
    }

    @ReactMethod
    public void signTransactions(String sessionId, String txPayloadsJson, Promise promise) {
        new Thread(() -> {
            try {
                String resultJson = nativeSignTransactionsSession(sessionId, txPayloadsJson);
                JSONObject obj = new JSONObject(resultJson);

                WritableMap map = Arguments.createMap();
                map.putBoolean("success", obj.optBoolean("success", false));
                map.putString("signedTxBase64", obj.optString("signedTxBase64", ""));
                map.putString("error", obj.optString("error", ""));

                WritableArray txsArr = Arguments.createArray();
                if (obj.has("signedTxsBase64")) {
                    JSONArray jsonTxs = obj.getJSONArray("signedTxsBase64");
                    for (int i = 0; i < jsonTxs.length(); i++) {
                        txsArr.pushString(jsonTxs.getString(i));
                    }
                }
                map.putArray("signedTxsBase64", txsArr);

                promise.resolve(map);
            } catch (Exception e) {
                promise.reject("SIGN_TRANSACTIONS_ERROR", e.getMessage() != null ? e.getMessage() : "Unknown Error");
            }
        }).start();
    }

    @ReactMethod
    public void closeSession(String sessionId, Promise promise) {
        new Thread(() -> {
            try {
                nativeCloseSession(sessionId);
                promise.resolve(null);
            } catch (Exception e) {
                promise.reject("CLOSE_SESSION_ERROR", e.getMessage() != null ? e.getMessage() : "Unknown Error");
            }
        }).start();
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
    private native void nativeCloseSession(String sessionId);
}
