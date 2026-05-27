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
    public void connectAndExecute(String cluster, ReadableMap instruction, Promise promise) {
        new Thread(() -> {
            try {
                String programId = instruction.getString("programId");
                String dataHex = instruction.getString("dataHex");
                ReadableArray keys = instruction.getArray("keys");
                
                JSONArray keysJsonArray = new JSONArray();
                for (int i = 0; i < keys.size(); i++) {
                    ReadableMap keyMap = keys.getMap(i);
                    JSONObject keyObj = new JSONObject();
                    keyObj.put("pubkey", keyMap.getString("pubkey"));
                    keyObj.put("isSigner", keyMap.getBoolean("isSigner"));
                    keyObj.put("isWritable", keyMap.getBoolean("isWritable"));
                    keysJsonArray.put(keyObj);
                }
                
                String keysJson = keysJsonArray.toString();
                String resultJson = nativeExecuteMwa(cluster, programId, dataHex, keysJson);
                
                JSONObject resultObj = new JSONObject(resultJson);
                WritableMap resultMap = Arguments.createMap();
                resultMap.putBoolean("success", resultObj.getBoolean("success"));
                resultMap.putString("signature", resultObj.getString("signature"));
                resultMap.putString("error", resultObj.getString("error"));
                
                promise.resolve(resultMap);
            } catch (Exception e) {
                promise.reject("error", e.getMessage() != null ? e.getMessage() : "Unknown Native Error");
            }
        }).start();
    }

    private native void nativeInstallJSI(long jsContextPointer);
    private native String nativeExecuteMwa(String cluster, String programId, String dataHex, String keysJson);
}
