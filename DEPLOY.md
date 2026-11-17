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

部署为直接上传，不会随 Git 推送自动更新。`wrangler.jsonc` 保存项目、产物目录与自定义域名路由；Cloudflare 自动配置域名解析与证书。最初创建的 Pages 项目 `fuckbms` 保留为备用地址 `https://fuckbms.pages.dev/`，不绑定生产域名。浏览器天地图 Key 从未提交的 `.env.local` 或构建环境 `VITE_TIANDITU_BROWSER_TK` 读取，需要在天地图控制台允许生产域名；不要将服务器凭证放入 `VITE_` 环境变量。

网页蓝牙使用访问者电脑或手机的适配器，需要浏览器支持并手动授权。Wi-Fi 连接通过浏览器访问 ESP32 的实际局域网地址，需要网络可达、跨域响应和本地网络权限。Cloudflare 只托管网页，不转发用户局域网设备请求。

`public/apk/` 与 `public/firmware/` 保留现有分发文件及其清单，不会因部署网页而替换成工作区最新 APK 或固件。生成目录不得混入本地测试证书、私钥或 `.env` 文件。
