// `./browser` ESM 子路径 / `browser` 条件入口：在浏览器打包工具中使用时
// 与主入口完全等价，不会注入 `globalThis.ZentaoAPI`。需要 `<script>` 标签
// 全局变量的场景请使用 `./browser/global` 子路径（IIFE 产物）。
export * from './index.js';
