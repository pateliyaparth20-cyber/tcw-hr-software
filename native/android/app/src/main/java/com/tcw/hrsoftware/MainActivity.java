package com.tcw.hrsoftware;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
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
        if(webView != null){ webView.stopLoading(); webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
