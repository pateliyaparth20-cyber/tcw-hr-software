package com.tcw.hrsoftware;

import android.app.Activity;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Build;
import android.os.CancellationSignal;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.webkit.JavaScriptReplyProxy;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;

// Origin-restricted, main-frame message listener owns this helper; no JavascriptInterface.
final class PhoneBiometric {
    private final Activity activity;
    private CancellationSignal cancellation;
    private JavaScriptReplyProxy pendingReply;
    private String pendingId;
    PhoneBiometric(Activity activity){this.activity=activity;}
    private void reply(JavaScriptReplyProxy proxy,String id,String error,JSONObject result){
        try { JSONObject response=new JSONObject();response.put("id",id);
            if(error!=null)response.put("error",error);else response.put("result",result);
            proxy.postMessage(response.toString());
        }catch(Exception ignored){}
    }
    void cancel(){
        if(cancellation!=null){CancellationSignal old=cancellation;cancellation=null;old.cancel();}
        if(pendingReply!=null){reply(pendingReply,pendingId,"Phone verification cancelled.",null);pendingReply=null;pendingId=null;}
    }
    private void finish(JavaScriptReplyProxy proxy,String id,String error,JSONObject result){
        if(pendingReply!=proxy||!id.equals(pendingId))return;
        pendingReply=null;pendingId=null;cancellation=null;reply(proxy,id,error,result);
    }
    void receive(String raw,JavaScriptReplyProxy proxy){
        String id="";
        try {
            JSONObject request=new JSONObject(raw);id=request.getString("id");
            if(!id.matches("[a-f0-9-]{36}"))return;
            String action=request.getString("action");
            if("cancel".equals(action)){cancel();return;}
            if(Build.VERSION.SDK_INT<28){reply(proxy,id,"Phone biometrics require Android 9 or later. Use camera verification on this phone.",null);return;}
            if("status".equals(action)){
                boolean supported=true;
                if(Build.VERSION.SDK_INT>=30){BiometricManager manager=activity.getSystemService(BiometricManager.class);supported=manager!=null&&manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG|BiometricManager.Authenticators.DEVICE_CREDENTIAL)==BiometricManager.BIOMETRIC_SUCCESS;}
                JSONObject result=new JSONObject();result.put("supported",supported);reply(proxy,id,null,result);return;
            }
            if(!"sign".equals(action)&&!"key".equals(action))return;
            if(pendingReply!=null){reply(proxy,id,"Phone verification is already open.",null);return;}
            String account=request.getString("accountKey"),payload=request.optString("payload","");
            if(!account.matches("[a-f0-9-]{36}:[a-f0-9-]{36}")||("sign".equals(action)&&(payload.length()>1000||!payload.startsWith("TCW_PHONE_V1|"+account.replace(':','|')+"|"))))throw new Exception("Invalid TCW phone challenge.");
            String alias="tcw_bio_"+Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(account.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP|Base64.URL_SAFE);
            KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
            if("key".equals(action)){JSONObject result=new JSONObject();result.put("publicKey",store.containsAlias(alias)?Base64.encodeToString(store.getCertificate(alias).getPublicKey().getEncoded(),Base64.NO_WRAP):JSONObject.NULL);reply(proxy,id,null,result);return;}
            boolean register=request.optBoolean("register",false);
            if(!store.containsAlias(alias)){
                if(!register)throw new Exception("This phone key is unavailable. Link this phone again and ask HR to approve it.");
                KeyPairGenerator generator=KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC,"AndroidKeyStore");
                KeyGenParameterSpec.Builder builder=new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_SIGN)
                    .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                    .setDigests(KeyProperties.DIGEST_SHA256).setUserAuthenticationRequired(true)
                    .setInvalidatedByBiometricEnrollment(true);
                if(Build.VERSION.SDK_INT>=30)builder.setUserAuthenticationParameters(0,KeyProperties.AUTH_BIOMETRIC_STRONG|KeyProperties.AUTH_DEVICE_CREDENTIAL);
                generator.initialize(builder.build());generator.generateKeyPair();
            }
            final Signature signature=Signature.getInstance("SHA256withECDSA");
            try{signature.initSign((PrivateKey)store.getKey(alias,null));}
            catch(android.security.keystore.KeyPermanentlyInvalidatedException error){store.deleteEntry(alias);throw new Exception("Phone biometrics changed. Link this phone again and ask HR to approve the new key.");}
            final String publicKey=Base64.encodeToString(store.getCertificate(alias).getPublicKey().getEncoded(),Base64.NO_WRAP);
            final String requestId=id;
            cancellation=new CancellationSignal();pendingReply=proxy;pendingId=id;
            BiometricPrompt.Builder builder=new BiometricPrompt.Builder(activity)
                .setTitle(register?"Link TCW Employee phone":"TCW Employee attendance")
                .setSubtitle("Verify with your phone's face, fingerprint or screen lock")
                .setDescription("Use your phone's enrolled biometrics or screen lock. TCW does not receive your face, fingerprint or PIN.");
            if(Build.VERSION.SDK_INT>=30)builder.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG|BiometricManager.Authenticators.DEVICE_CREDENTIAL);
            else builder.setNegativeButton("Cancel",activity.getMainExecutor(),(dialog,which)->cancel());
            builder.build().authenticate(new BiometricPrompt.CryptoObject(signature),cancellation,activity.getMainExecutor(),new BiometricPrompt.AuthenticationCallback(){
                @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult auth){
                    try{Signature authenticated=auth.getCryptoObject()==null?null:auth.getCryptoObject().getSignature();if(authenticated==null)throw new Exception("Phone could not authorize its signing key.");
                        authenticated.update(payload.getBytes(StandardCharsets.UTF_8));JSONObject result=new JSONObject();
                        result.put("signature",Base64.encodeToString(authenticated.sign(),Base64.NO_WRAP));result.put("publicKey",publicKey);
                        finish(proxy,requestId,null,result);
                    }catch(Exception error){finish(proxy,requestId,"Phone signing failed. Retry or link this phone again.",null);}
                }
                @Override public void onAuthenticationError(int code,CharSequence message){finish(proxy,requestId,message.toString(),null);}
                // A non-match keeps Android's dialog open for its own bounded retry/lockout handling.
            });
        }catch(Exception error){
            if(pendingReply==proxy&&id.equals(pendingId)){cancel();}
            reply(proxy,id,error.getMessage()==null?"Phone biometric verification is unavailable.":error.getMessage(),null);
        }
    }
}
