package com.xiaomang.bang;

import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import java.io.File;

public class MainActivity extends AppCompatActivity {

    private WebView webView;

    // WebViewAssetLoader 提供的同源 https origin（Android 官方推荐做法）
    // 用它与 assets 目录映射，使页面拥有正常 https 源：
    //   - localStorage 持久化可用（file:// 下在部分系统被禁用）
    //   - Service Worker 可注册（PWA 离线能力保留）
    //   - 不受 file:// 混合内容限制
    private static final String ASSET_ORIGIN = "https://appassets.androidplatform.com";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        // 页面走 https(asset origin)，但接口是 https 且 ACAO:*，无需放行明文；
        // 仍保留 ALWAYS_ALLOW 以防旧安卓混合内容误判
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        ws.setCacheMode(WebSettings.LOAD_DEFAULT);
        ws.setAllowFileAccess(false);

        // 缓存目录（接口数据/图片），避免无意义占用
        webView.setWebViewClient(new WebViewClientCompat() {
            private final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                    .setDomain("appassets.androidplatform.com")
                    .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(MainActivity.this))
                    .build();

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, android.webkit.WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
        });

        // 删除旧 file:// 缓存（升级兼容）
        try {
            File oldDb = new File(getCacheDir(), "webview");
            if (oldDb.exists()) deleteRecursively(oldDb);
        } catch (Exception ignored) {
        }

        webView.loadUrl(ASSET_ORIGIN + "/assets/index.html");
    }

    private static void deleteRecursively(File f) {
        if (f.isDirectory()) {
            File[] children = f.listFiles();
            if (children != null) for (File c : children) deleteRecursively(c);
        }
        f.delete();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
