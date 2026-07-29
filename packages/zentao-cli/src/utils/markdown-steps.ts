/**
 * Minimal Markdown → ZenTao steps HTML converter.
 *
 * Supported subset (see plan D3=P):
 * - ATX headings `#` / `##` … → `<p><strong>…</strong></p>`
 * - blank-line separated paragraphs
 * - ordered list lines `1. item` → `<p>1. item</p>`
 * - unordered list lines `- item` / `* item` → `<p>item</p>`
 * - `**bold**` / `` `code` `` inline
 * - `![alt](url)` → ZenTao-friendly `<img onload="setImageSize(this,0)" …>`
 *
 * Unsupported constructs fall through as escaped text. No auto-upload of local images.
 */

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const ORDERED_LIST_RE = /^(\d+)\.\s+(.+)$/;
const UNORDERED_LIST_RE = /^[-*]\s+(.+)$/;
const IMAGE_ONLY_RE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;

/** Escape text for HTML text nodes / attribute values. */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Inline: `**bold**` and `` `code` `` (non-nested, left-to-right). */
export function renderInline(text: string): string {
    // Protect code spans first so bold inside code is not processed.
    const codeParts: string[] = [];
    let withCodePlaceholders = text.replace(/`([^`]+)`/g, (_, code: string) => {
        const i = codeParts.length;
        codeParts.push(`<code>${escapeHtml(code)}</code>`);
        return `\u0000C${i}\u0000`;
    });

    withCodePlaceholders = withCodePlaceholders.replace(
        /\*\*([^*]+)\*\*/g,
        (_, bold: string) => `<strong>${escapeHtml(bold)}</strong>`,
    );

    // Escape remaining plain segments between placeholders / tags is tricky;
    // split on already-produced tags and placeholders.
    const tokenRe = /(\u0000C\d+\u0000|<strong>[^<]*<\/strong>)/g;
    const pieces: string[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(withCodePlaceholders)) !== null) {
        if (m.index > last) {
            pieces.push(escapeHtml(withCodePlaceholders.slice(last, m.index)));
        }
        const tok = m[0];
        if (tok.startsWith('\u0000C')) {
            const idx = Number(tok.slice(2, -1));
            pieces.push(codeParts[idx] ?? '');
        } else {
            pieces.push(tok);
        }
        last = m.index + tok.length;
    }
    if (last < withCodePlaceholders.length) {
        pieces.push(escapeHtml(withCodePlaceholders.slice(last)));
    }
    return pieces.join('');
}

function p(inner: string): string {
    return `<p>${inner}</p>`;
}

function renderImage(alt: string, src: string): string {
    return p(
        `<img onload="setImageSize(this,0)" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />`,
    );
}

function renderLine(line: string): string {
    const trimmed = line.trimEnd();
    if (!trimmed.trim()) return '';

    const img = trimmed.trim().match(IMAGE_ONLY_RE);
    if (img) {
        return renderImage(img[1], img[2]);
    }

    const heading = trimmed.match(HEADING_RE);
    if (heading) {
        return p(`<strong>${renderInline(heading[2])}</strong>`);
    }

    const ordered = trimmed.match(ORDERED_LIST_RE);
    if (ordered) {
        return p(`${escapeHtml(ordered[1])}. ${renderInline(ordered[2])}`);
    }

    const unordered = trimmed.match(UNORDERED_LIST_RE);
    if (unordered) {
        return p(renderInline(unordered[1]));
    }

    return p(renderInline(trimmed));
}

/**
 * Convert Markdown subset used for ZenTao bug/testcase steps into light HTML.
 * Empty / whitespace-only input returns `""`.
 */
export function markdownStepsToHtml(md: string): string {
    if (!md || !md.trim()) return '';

    // Normalize newlines; split into blocks on blank lines.
    const normalized = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = normalized.split(/\n{2,}/);
    const parts: string[] = [];

    for (const block of blocks) {
        const lines = block.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
        if (lines.length === 0) continue;

        // Multi-line block: if every line is a list item / heading / image, render line-wise.
        // Otherwise treat consecutive plain lines as one paragraph (join with space).
        const allSpecial = lines.every(
            (l) =>
                HEADING_RE.test(l.trim()) ||
                ORDERED_LIST_RE.test(l.trim()) ||
                UNORDERED_LIST_RE.test(l.trim()) ||
                IMAGE_ONLY_RE.test(l.trim()),
        );

        if (allSpecial || lines.length === 1) {
            for (const line of lines) {
                const html = renderLine(line);
                if (html) parts.push(html);
            }
            continue;
        }

        // Mixed / plain multi-line: still prefer line-wise when any line is special;
        // pure plain → single <p>.
        const anySpecial = lines.some(
            (l) =>
                HEADING_RE.test(l.trim()) ||
                ORDERED_LIST_RE.test(l.trim()) ||
                UNORDERED_LIST_RE.test(l.trim()) ||
                IMAGE_ONLY_RE.test(l.trim()),
        );
        if (anySpecial) {
            for (const line of lines) {
                const html = renderLine(line);
                if (html) parts.push(html);
            }
        } else {
            parts.push(p(renderInline(lines.map((l) => l.trim()).join(' '))));
        }
    }

    return parts.join('');
}
