// IIFE 入口：被 `scripts/build-browser.ts` 打成 `dist/browser/zentao-api.global.js`
// 后供 `<script>` 标签直接引入，会显式把整个 SDK 挂到 `globalThis.ZentaoAPI` /
// `window.ZentaoAPI` 上。ESM 用户请使用 `./browser` 子路径或主入口，不会触发
// 全局变量注入。
import * as api from './index.js';

const globalTarget = globalThis as typeof globalThis & {
  ZentaoAPI?: typeof api;
  window?: { ZentaoAPI?: typeof api };
};

// Bun 的 IIFE bundle 不总是自动挂载 globalName；这里显式暴露浏览器全局对象。
globalTarget.ZentaoAPI = api;
if (globalTarget.window) {
  globalTarget.window.ZentaoAPI = api;
}

export * from './index.js';
