# 小芒榜 · 安卓 APK 工程（WebView 套壳）

把已做好的 PWA 前端（`index.html` / `app.js` / `core.js` / `styles.css`）内置进安卓
`WebView`，零改动复用全部业务逻辑（月榜/季榜双榜单 + 变动记录 + 自动刷新）。
用 `WebViewAssetLoader` 把 assets 以同源 https 暴露，localStorage / Service Worker 正常工作。

## 目录结构
```
xiaomang-apk/
├─ settings.gradle / build.gradle / gradle.properties   # Gradle 工程配置
├─ app/
│  ├─ build.gradle                                      # AGP 8.5 / minSdk 26 / target 34
│  └─ src/main/
│     ├─ AndroidManifest.xml
│     ├─ java/com/xiaomang/bang/MainActivity.java        # WebView 加载 assets/index.html
│     ├─ res/                                            # 图标 / 主题（无 png，自适应图标）
│     └─ assets/                                          # ← PWA 前端（已复制）
│        ├─ index.html  app.js  core.js  styles.css
└─ .github/workflows/build.yml                           # GitHub Actions 自动编 debug APK
```

## 方式一：本地用 Android Studio 编译（无需 GitHub）
1. 安装 [Android Studio](https://developer.android.com/studio)（自带 SDK + Gradle wrapper）。
2. Open → 选本目录 `xiaomang-apk/`，等待 Gradle Sync 完成（会自动生成 wrapper）。
3. 菜单 Build → Build Bundle(s) / APK(s) → Build APK(s)。
4. 产物：`app/build/outputs/apk/debug/app-debug.apk`，传到手机安装即可。

## 方式二：推到 GitHub 触发 Actions 自动编译（免费）
1. 在 GitHub 新建一个**空仓库**（如 `xiaomang-bang-apk`）。
2. 在本目录初始化并推送：
   ```bash
   git init
   git add -A
   git commit -m "小芒榜 APK 工程"
   git branch -M main
   git remote add origin https://github.com/<你的账号>/xiaomang-bang-apk.git
   git push -u origin main
   ```
3. 仓库页 Actions → Build APK → 跑完后在 Artifacts 下载 `xiaomang-bang-apk`
   （`app/build/outputs/apk/debug/app-debug.apk`）。
4. 之后每次 `git push` 都会自动重新编译。

## 说明
- debug 签名 APK 可直接侧载安装（手机「设置→安全→未知来源」允许即可），无需 $25 上架。
- 若需正式上架 Play 商店，再配 release 签名（参考 `app/build.gradle` 的 release 块）。
- 接口 `mgeact.api.mgtv.com` 实测 `Access-Control-Allow-Origin: *`，无需任何中转。
