# Cloudflare 部署

生产域名：`https://fuckbms.com/`；Workers Static Assets 项目：`fuckbms`；代码分支：`main`。

在本目录执行：

```sh
npm ci
npm run typecheck
npm run build
npm exec --yes --package=wrangler@4.164.0 -- wrangler deploy --dry-run
npm exec --yes --package=wrangler@4.164.0 -- wrangler deploy
```

部署前需要通过 Wrangler 登录有该项目权限的 Cloudflare 账号。这里只部署正式构建 `dist`，演示构建 `dist-preview` 不用于线上连接设备。

部署为直接上传，不会随 Git 推送自动更新。高德骑行导航使用 Worker 的 `AMAP_JS_KEY` 和 `AMAP_SECURITY_JS_CODE` 密钥绑定。首次配置时用 Wrangler 安全输入两项密钥，后续部署复用绑定。`wrangler.jsonc` 保存项目、产物目录与自定义域名路由；Cloudflare 自动配置域名解析与证书。最初创建的 Pages 项目 `fuckbms` 保留为备用地址 `https://fuckbms.pages.dev/`，不绑定生产域名。浏览器天地图 Key 从未提交的 `.env.local` 或构建环境 `VITE_TIANDITU_BROWSER_TK` 读取，需要在天地图控制台允许生产域名；不要将服务器凭证放入 `VITE_` 环境变量。

网页蓝牙使用访问者电脑或手机的适配器，需要浏览器支持并手动授权。Wi-Fi 连接通过浏览器访问 ESP32 的实际局域网地址，需要网络可达、跨域响应和本地网络权限。Cloudflare 只托管网页，不转发用户局域网设备请求。

普通网页构建保留 `public/apk/` 与 `public/firmware/` 的分发文件；完整双链路发布按下方流程显式替换 App 并暂存签名网页资源。生成目录不得混入本地测试证书、私钥或 `.env` 文件。

## GitHub 和 Cloudflare 双链路

App、固件和网页更新详情都提供 Cloudflare / GitHub 选择；点击卡片或切换链路不会下载。手动检查只使用所选链路，失败可切换重试。网页与原生签名资源的后台检查按 Cloudflare → GitHub 回退。下载并校验成功后才标记可应用，查看详情不自动安装、重启或刷写。

Cloudflare 使用本域名；GitHub 使用独立 `updates` 分支的 Raw 地址：`https://raw.githubusercontent.com/wintsa123/espBmsSetting/updates/`。`main` 保存源码，`updates` 只保存构建发布产物；两个链路上传同一个 `dist`，`apk/latest.json`、`firmware/firmware.json` 和 `web-update.json` 的相对路径始终落在所选镜像内。

完整发布在父仓库执行（私钥放仓库外；`RELEASE_SEQUENCE` 必须递增；不要把 APK 内信任的公钥随意换掉）：

```sh
RELEASE_SEQUENCE=$(date +%s%3N)
python3 scripts/publish-dual-updates.py --key "$WEB_SIGNING_KEY" --sequence "$RELEASE_SEQUENCE" --prepare-app
WEB_UPDATE_SEQUENCE="$RELEASE_SEQUENCE" npm --prefix vercel run build
# 用项目 Android 构建工具运行 :app:assembleDebug :app:testDebugUnitTest
python3 scripts/publish-dual-updates.py --key "$WEB_SIGNING_KEY" --sequence "$RELEASE_SEQUENCE" --apk android-cast/app/build/outputs/apk/debug/app-debug.apk
# 将 vercel/dist 的全部文件提交到 updates 分支，上传后再部署 CF；此后不要再次 build 清除暂存产物。
```

APK 目前使用项目现有调试签名。签名网页清单为 `web/manifest-cf.json` 和 `web/manifest-github.json`，资源放 `web/web-<sequence>/`；APK 只含公钥及链路配置。私钥不可提交或上传。CF 由 Worker 直接响应签名包的 `index.html`，避免原生下载器因重定向拒绝更新。为外部浏览器镜像检查提供静态资源 CORS。

只发布网页时无需替换 APK，但仍需重新生成并上传对应签名资源，使已安装 App 获得相同网页版本。固件二进制未改动时继续分发现有清单，不能把网页上线当作硬件固件验收。
