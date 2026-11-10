# dashboard 界面来源

`dashboard.css` 是用户指定的 `https://github.com/lswlc33/dashboard` 中 `public/styles.css` 的完整副本，来源提交为 `35aa033eecb95f214dce059850aa629557abfd98`，读取日期为 2026-11-10。此副本不删规则，不修改动画或过渡。

React 使用原有 `.stage > .phone > .topbar / .loadbar / .scroll > .page / .tabbar` 骨架。`../styles.css` 仅适配设备业务表单、原有三个导航槽位，以及浏览器手机外壳和预览状态栏。原生 App 不显示预览外壳和模拟状态栏。原页面没有模拟状态栏，由原生系统显示；网页预览的状态栏是本项目补充。

`dashboard-parts.ts` 移植原 `ui.js` 的线性图标、`fallbackScooter`、`socBar` 和 `bars`；骑行图表接入设备会话的实际分钟数。`dashboard-motion.ts` 移植数字滚动、页面方向入场、导航滑块、滚动顶栏与模糊遮罩、按压和加载条逻辑，保留原公式、时长和 CSS 动画类；只调整为 React 生命周期并清理监听器与动画帧。

此次核对的来源仓库没有顶层 `LICENSE`，不能将其第三方 Apache 2.0 或 MIT 许可视为自有代码的许可。本次按用户明确指定复用其代码进行集成；对外再分发前应核实来源代码授权。业务不加载来源仓库的账号、车控、车辆位置或云端接口。

`../DashboardTheme.tsx` 将原 `app.js` 的 `themeSheet` / `editThemeSheet` 转为 React：保留三种外观模式、八组预设强调色、自定义主色与辅助色、随机配色样式、实时预览和取消恢复。`dashboard-theme-engine.js` 从原 `tools/theme-source.mjs` 使用来源仓库已安装的 Material Color Utilities 依赖打包，保留原 HCT / DynamicScheme 算法、预设、校验和颜色角色映射；去除 ZeehoShell 原生动态调色板桥与原账号偏好读取。本项目使用 `bms.dashboard.theme` 本地保存，响应系统主题变化。Google Material Color Utilities 的 Apache-2.0 许可及版权声明保存在 `dashboard-theme.LICENSE.txt` 与引擎末尾。


首页默认 AE5 图片见 `public/art/AE5_SOURCE.md`。点击车辆图片可选择本地图片，经解码、尺寸与大小验证并缩放后保存在当前浏览器或 App 的本地存储中。

`dashboard-swipe.ts` 同步来源提交 `7c413f02ac57feafd6c161192887e750d9ba97cb`（2026-11-10 23:17 +08:00）的 `ui.js bindHorizontalPages` 与 `app.js` 导航进度公式：横向拖动显示相邻页，72px 判定切页，180ms 收尾，边界阻尼且不循环；沿用输入框、横向滚动区和业务按钮的手势避让。`../styles.css` 仅补入该提交的邻页与导航跟手规则，未替换前述完整样式副本。React 适配包括监听和动画帧卸载、从已有页面创建无交互预览、同步提交选中页以及避免重复入场动画；三个底栏和设备业务均保持现状。
