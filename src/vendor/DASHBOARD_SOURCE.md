# dashboard 界面来源

`dashboard.css` 是用户指定的 `https://github.com/lswlc33/dashboard` 中 `public/styles.css` 的完整副本，来源提交为 `35aa033eecb95f214dce059850aa629557abfd98`，读取日期为 2026-11-10。此副本不删规则，不修改动画或过渡。

React 使用原有 `.stage > .phone > .topbar / .loadbar / .scroll > .page / .tabbar` 骨架。`../styles.css` 仅适配设备业务表单、五个导航槽位，以及浏览器手机外壳和预览状态栏。原生 App 不显示预览外壳和模拟状态栏。原页面没有模拟状态栏，由原生系统显示；网页预览的状态栏是本项目补充。

`dashboard-parts.ts` 移植原 `ui.js` 的线性图标、`fallbackScooter`、`socBar` 和 `bars`；骑行图表接入设备会话的实际分钟数。`dashboard-motion.ts` 移植数字滚动、页面方向入场、导航滑块、滚动顶栏与模糊遮罩、按压和加载条逻辑，保留原公式、时长和 CSS 动画类；只调整为 React 生命周期并清理监听器与动画帧。

此次核对的来源仓库没有顶层 `LICENSE`，不能将其第三方 Apache 2.0 或 MIT 许可视为自有代码的许可。本次按用户明确指定复用其代码进行集成；对外再分发前应核实来源代码授权。业务不加载来源仓库的账号、车控、车辆位置或云端接口。
