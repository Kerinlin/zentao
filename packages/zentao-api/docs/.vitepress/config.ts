import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vitepress';

const docsRoot = fileURLToPath(new URL('../', import.meta.url));
const packageJson = JSON.parse(
  readFileSync(resolve(docsRoot, '..', 'package.json'), 'utf8'),
) as { version: string };
const pkgVersion = packageJson.version;

function readSidebar(relativePath: string, fallback: unknown[]) {
  const path = resolve(docsRoot, relativePath);
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

const referenceSidebar = readSidebar('reference/typedoc-sidebar.json', [
  { text: 'Reference', items: [{ text: '概览', link: '/reference/' }] },
]);

const zentaoApiSidebar = readSidebar('zentao-api/sidebar.json', [
  { text: 'ZenTao API', items: [{ text: '概览', link: '/zentao-api/' }] },
]);

export default defineConfig({
  lang: 'zh-CN',
  title: 'zentao-api',
  description: 'Browser and Node.js SDK for ZenTao API v2',
  base: '/',
  lastUpdated: true,
  cleanUrls: true,
  markdown: {
    lineNumbers: true,
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
  },
  themeConfig: {
    siteTitle: 'zentao-api',
    nav: [
      { text: 'Guide', link: '/guide/', activeMatch: '/guide/' },
      { text: 'Reference', link: '/reference/', activeMatch: '/reference/' },
      { text: 'ZenTao API', link: '/zentao-api/', activeMatch: '/zentao-api/' },
      {
        text: `v${pkgVersion}`,
        items: [
          { text: 'Changelog', link: 'https://github.com/easysoft/zentao-api/blob/main/CHANGES.md' },
          { text: 'Releases', link: 'https://github.com/easysoft/zentao-api/releases' },
        ],
      },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: '快速开始', link: '/guide/' },
            { text: '安装与配置', link: '/guide/installation' },
            { text: '运行环境', link: '/guide/environments' },
            { text: '常见 API 示例', link: '/guide/examples' },
            { text: '本地数据处理', link: '/guide/data-processing' },
            { text: 'Profile 与错误处理', link: '/guide/profiles-and-errors' },
          ],
        },
      ],
      '/reference/': referenceSidebar,
      '/zentao-api/': zentaoApiSidebar,
    },
    search: {
      provider: 'local',
    },
    outline: {
      level: [2, 3],
      label: '本页目录',
    },
    editLink: {
      pattern: 'https://github.com/easysoft/zentao-api/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页',
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/easysoft/zentao-api' },
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026-present zentao-api contributors',
    },
    docFooter: {
      prev: '上一页',
      next: '下一页',
    },
    lastUpdated: {
      text: '最后更新',
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'short',
      },
    },
  },
});
