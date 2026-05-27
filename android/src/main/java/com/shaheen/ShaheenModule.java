package com.shaheen;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.JavaScriptContextHolder;
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

    @Override
    public void initialize() {
        super.initialize();
        JavaScriptContextHolder jsContext = getReactApplicationContext().getJavaScriptContextHolder();
        if (jsContext != null && jsContext.get() != 0) {
            nativeInstallJSI(jsContext.get());
        }
    }

    @ReactMethod
    public void generateAssociationUri(Promise promise) {
        new Thread(() -> {
            try {
                String resultJson = nativeGenerateAssociation();
                JSONObject resultObj = new JSONObject(resultJson);
                WritableMap resultMap = Arguments.createMap();
                resultMap.putString("uri", resultObj.getString("uri"));
                resultMap.putInt("port", resultObj.getInt("port"));
                promise.resolve(resultMap);
            } catch (Exception e) {
                promise.reject("error", e.getMessage() != null ? e.getMessage() : "Unknown Native Error");
            }
        }).start();
    }

    @ReactMethod
    public void connectAndAuthorize(String cluster, int port, Promise promise) {
        new Thread(() -> {
            try {
                String resultJson = nativeAuthorize(cluster);
                JSONObject resultObj = new JSONObject(resultJson);
                WritableMap resultMap = Arguments.createMap();
                resultMap.putBoolean("success", resultObj.getBoolean("success"));
                resultMap.putString("publicKey", resultObj.getString("publicKey"));
                resultMap.putString("authToken", resultObj.getString("authToken"));
                resultMap.putString("error", resultObj.getString("error"));
                promise.resolve(resultMap);
            } catch (Exception e) {
                promise.reject("error", e.getMessage() != null ? e.getMessage() : "Unknown Native Error");
            }
        }).start();
    }

    @ReactMethod
    public void connectAndSign(String cluster, int port, String txHex, String authToken, Promise promise) {
        new Thread(() -> {
            try {
                String resultJson = nativeSignTransactions(cluster, txHex, authToken);
                JSONObject resultObj = new JSONObject(resultJson);
                WritableMap resultMap = Arguments.createMap();
                resultMap.putBoolean("success", resultObj.getBoolean("success"));
                resultMap.putString("signature", resultObj.getString("signature"));
                resultMap.putString("signedTxHex", resultObj.getString("signedTxHex"));
                resultMap.putString("error", resultObj.getString("error"));
                promise.resolve(resultMap);
            } catch (Exception e) {
                promise.reject("error", e.getMessage() != null ? e.getMessage() : "Unknown Native Error");
            }
        }).start();
    }

    private native void nativeInstallJSI(long jsContextPointer);
    private native String nativeGenerateAssociation();
    private native String nativeAuthorize(String cluster);
    private native String nativeSignTransactions(String cluster, String txHex, String authToken);
}
