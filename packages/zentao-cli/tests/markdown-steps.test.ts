import { describe, expect, test } from 'bun:test';
import {
    escapeHtml,
    markdownStepsToHtml,
    renderInline,
} from '../src/utils/markdown-steps';

describe('escapeHtml', () => {
    test('escapes special characters', () => {
        expect(escapeHtml(`a&b<c>d"e`)).toBe('a&amp;b&lt;c&gt;d&quot;e');
    });
});

describe('renderInline', () => {
    test('bold and code', () => {
        expect(renderInline('有 **加粗** 和 `code`')).toBe(
            '有 <strong>加粗</strong> 和 <code>code</code>',
        );
    });

    test('escapes raw angle brackets in text', () => {
        expect(renderInline('分数 < 60')).toBe('分数 &lt; 60');
    });
});

describe('markdownStepsToHtml', () => {
    test('empty / whitespace → empty string', () => {
        expect(markdownStepsToHtml('')).toBe('');
        expect(markdownStepsToHtml('   \n\n  ')).toBe('');
    });

    test('heading and paragraph', () => {
        const html = markdownStepsToHtml(`## 问题描述

定位样式错误`);
        expect(html).toContain('<p><strong>问题描述</strong></p>');
        expect(html).toContain('<p>定位样式错误</p>');
    });

    test('ordered list lines', () => {
        const html = markdownStepsToHtml(`## 重现步骤

1. 打开求救群
2. 查看 SOS`);
        expect(html).toContain('<p><strong>重现步骤</strong></p>');
        expect(html).toContain('<p>1. 打开求救群</p>');
        expect(html).toContain('<p>2. 查看 SOS</p>');
    });

    test('unordered list strips marker', () => {
        const html = markdownStepsToHtml(`- 未处理 → 红色
* 已处理 → 灰`);
        expect(html).toContain('<p>未处理 → 红色</p>');
        expect(html).toContain('<p>已处理 → 灰</p>');
    });

    test('image becomes ZenTao img tag', () => {
        const html = markdownStepsToHtml('![SOS](/zentao/file-read-8787.png)');
        expect(html).toBe(
            '<p><img onload="setImageSize(this,0)" src="/zentao/file-read-8787.png" alt="SOS" /></p>',
        );
    });

    test('full bug steps sample', () => {
        const md = `## 问题描述
求救群终端上报的 SOS 消息中，定位信息展示样式错误。

## 重现步骤
1. 打开求救群聊天界面
2. 查看终端上报的 SOS 报警消息
3. 观察消息中的位置/定位展示样式

## 实际结果
定位样式异常，例如：\`位置116°E\`

![截图](/zentao/file-read-8787.png)

## 期望结果
定位信息应按正确样式展示。`;

        const html = markdownStepsToHtml(md);
        expect(html).toContain('<p><strong>问题描述</strong></p>');
        expect(html).toContain('<p><strong>重现步骤</strong></p>');
        expect(html).toContain('<p>1. 打开求救群聊天界面</p>');
        expect(html).toContain('<code>位置116°E</code>');
        expect(html).toContain('src="/zentao/file-read-8787.png"');
        expect(html).toContain('<p><strong>期望结果</strong></p>');
    });

    test('unsupported table-ish lines fall through as text', () => {
        const html = markdownStepsToHtml('| a | b |\n|---|---|');
        expect(html).toContain('| a | b |');
        expect(html).not.toContain('<table');
    });
});
