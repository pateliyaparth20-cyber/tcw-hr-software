package com.tcw.hrsoftware;

import android.app.Activity;
import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 1002;
    private static final int CAMERA_PERMISSION_REQUEST = 1003;
    private static final int LOCATION_PERMISSION_REQUEST = 1004;
    private GeolocationPermissions.Callback pendingLocationCallback;
    private String pendingLocationOrigin;
    private static final String NOTIFICATION_CHANNEL = "tcw_hr_updates";
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private PermissionRequest pendingCameraPermission;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        setContentView(webView);
        createNotificationChannel();
        requestNotificationPermission();
        webView.addJavascriptInterface(new NativeBridge(), "TCWNative");

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);

        webView.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params){
                if(filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                Intent intent;
                try { intent = params.createIntent(); }
                catch(Exception error){ filePathCallback = null; return false; }
                try { startActivityForResult(intent, FILE_CHOOSER_REQUEST); return true; }
                catch(ActivityNotFoundException error){ filePathCallback = null; return false; }
            }

            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback){
                if(!isAppOrigin(Uri.parse(origin)) || !"https".equalsIgnoreCase(Uri.parse(origin).getScheme())){ callback.invoke(origin,false,false); return; }
                if(Build.VERSION.SDK_INT < 23 || (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED)){ callback.invoke(origin,true,false); return; }
                if(pendingLocationCallback != null) pendingLocationCallback.invoke(pendingLocationOrigin,false,false);
                pendingLocationCallback=callback; pendingLocationOrigin=origin;
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},LOCATION_PERMISSION_REQUEST);
            }
            @Override public void onGeolocationPermissionsHidePrompt(){
                if(pendingLocationCallback != null) pendingLocationCallback.invoke(pendingLocationOrigin,false,false);
                pendingLocationCallback=null; pendingLocationOrigin=null;
            }
            @Override public void onPermissionRequest(PermissionRequest request){
                runOnUiThread(() -> {
                    if(!isAppOrigin(request.getOrigin())){ request.deny(); return; }
                    boolean wantsCamera = false;
                    for(String resource : request.getResources()){
                        if(PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)){ wantsCamera = true; break; }
                    }
                    if(!wantsCamera){ request.deny(); return; }
                    if(Build.VERSION.SDK_INT < 23 || checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED){
                        request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                        return;
                    }
                    if(pendingCameraPermission != null) pendingCameraPermission.deny();
                    pendingCameraPermission = request;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
                });
            }
        });

        webView.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request){
                Uri uri = request.getUrl();
                if(isAppOrigin(uri)) return false;
                openExternal(uri);
                return true;
            }
        });

        if(state == null || webView.restoreState(state) == null) webView.loadUrl(BuildConfig.TCW_APP_URL);
    }

    private void createNotificationChannel(){
        NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if(manager==null)return;
        NotificationChannel channel=new NotificationChannel(NOTIFICATION_CHANNEL,"TCW HR notifications",NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("HR alerts, approvals and software updates");
        manager.createNotificationChannel(channel);
    }

    private void requestNotificationPermission(){
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIFICATION_PERMISSION_REQUEST);
        }
    }

    private void showNativeNotification(String title,String body,String url,String tag){
        runOnUiThread(()->{
            if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
            Intent intent=new Intent(this,MainActivity.class);
            intent.setData(Uri.parse(isAppOrigin(Uri.parse(url))?url:BuildConfig.TCW_APP_URL+"/notifications"));
            intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pending=PendingIntent.getActivity(this,Math.abs((tag+url).hashCode()),intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            Notification notification=new Notification.Builder(this,NOTIFICATION_CHANNEL)
                .setSmallIcon(com.tcw.hrsoftware.R.drawable.tcw_logo)
                .setContentTitle(title==null||title.isEmpty()?"TCW HR Software":title)
                .setContentText(body==null?"":body)
                .setStyle(new Notification.BigTextStyle().bigText(body==null?"":body))
                .setAutoCancel(true)
                .setContentIntent(pending)
                .build();
            NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
            if(manager!=null)manager.notify(Math.abs(tag.hashCode()),notification);
        });
    }

    private class NativeBridge {
        @JavascriptInterface public void showNotification(String title,String body,String url,String tag){
            String target=url==null||url.isEmpty()?BuildConfig.TCW_APP_URL+"/notifications":url;
            if(target.startsWith("/"))target=BuildConfig.TCW_APP_URL.replaceAll("/$","")+target;
            showNativeNotification(title,body,target,tag==null?"tcw":tag);
        }

        @JavascriptInterface public String getAppMode(){
            return BuildConfig.TCW_APP_MODE;
        }

        @JavascriptInterface public boolean isEmployeeApp(){
            return "EMPLOYEE".equals(BuildConfig.TCW_APP_MODE);
        }
    }

    @Override protected void onNewIntent(Intent intent){
        super.onNewIntent(intent);
        setIntent(intent);
        Uri target=intent.getData();
        if(target!=null&&webView!=null&&isAppOrigin(target))webView.loadUrl(target.toString());
    }

    private boolean isAppOrigin(Uri uri){
        Uri home = Uri.parse(BuildConfig.TCW_APP_URL);
        String homeScheme = home.getScheme(), uriScheme = uri.getScheme();
        String homeHost = home.getHost(), uriHost = uri.getHost();
        if(homeScheme == null || homeHost == null || uriScheme == null || uriHost == null) return false;
        return homeScheme.equalsIgnoreCase(uriScheme)
            && homeHost.equalsIgnoreCase(uriHost)
            && normalizedPort(home) == normalizedPort(uri);
    }

    private int normalizedPort(Uri uri){
        if(uri.getPort() != -1) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : "http".equalsIgnoreCase(uri.getScheme()) ? 80 : -1;
    }

    private void openExternal(Uri uri){
        String scheme = uri.getScheme();
        if(scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https") || scheme.equalsIgnoreCase("mailto") || scheme.equalsIgnoreCase("tel"))) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
        catch(ActivityNotFoundException ignored) { }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults){
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if(requestCode == LOCATION_PERMISSION_REQUEST && pendingLocationCallback != null){
            boolean granted=checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;
            pendingLocationCallback.invoke(pendingLocationOrigin,granted,false); pendingLocationCallback=null; pendingLocationOrigin=null;
        }
        if(requestCode == CAMERA_PERMISSION_REQUEST && pendingCameraPermission != null){
            PermissionRequest request = pendingCameraPermission;
            pendingCameraPermission = null;
            if(grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED){
                request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            } else {
                request.deny();
            }
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data){
        if(requestCode == FILE_CHOOSER_REQUEST){
            if(filePathCallback != null){
                filePathCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override protected void onSaveInstanceState(Bundle outState){
        if(webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override public void onBackPressed(){
        if(webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }

    @Override protected void onDestroy(){
        if(filePathCallback != null){ filePathCallback.onReceiveValue(null); filePathCallback = null; }
        if(pendingCameraPermission != null){ pendingCameraPermission.deny(); pendingCameraPermission = null; }
        if(webView != null){ webView.stopLoading(); webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
