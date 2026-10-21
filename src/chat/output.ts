import { INCOMPLETE, MIN_REPLY_BYTES, requireInteger } from '../config/schema.js';
import type { Config } from '../config/schema.js';
import { bytes, chars } from '../model/client.js';
import { aiError } from '../types.js';
import type { Round } from '../types.js';

export function checkOutput(config: Config): void {
    for (const value of [config.qq.maxSegmentUtf8Bytes, config.qq.maxReplySegments, config.qq.outputHardLimit,
    config.qq.inactivityDays, ...(config.qq.multiTurnEnabled ? [config.qq.historyMaxChars, config.qq.historyMaxTurns] : [])]) {
        requireInteger(value);
    }

    if (Math.min(config.qq.maxSegmentUtf8Bytes, config.qq.outputHardLimit) < MIN_REPLY_BYTES) {
        throw aiError('INVALID_CONFIG', '输出上限过小');
    }
}

export interface ReplyPart { text: string; markdown: boolean }
const pointBytes = (point: string): number => {
    const code = point.codePointAt(0)!;

    return code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
};

// 保守检查 Markdown 结构，无法明确识别的块按原文纯文本发送。
function completeInlineMarkdown(text: string, segmentMax: number): boolean {
    // 行内正文已超出单段字节上限时，整块必然按纯文本拆分。
    if (text.length > segmentMax) { return false; }

    const stack: string[] = [];
    let code = '';
    let parentheses = 0;
    let angles = 0;

    for (const match of text.matchAll(/\\[\s\S]|`+|!\[|\*+|_+|~~|[\[\]()<>]/g)) {
        const token = match[0];

        if (token.startsWith('\\')) {
            continue;
        }

        if (token === '![') {
            // QQ 对语法的支持存在差异，代码中的图片示例也按原文纯文本发送。
            return false;
        }

        if (code) {
            if (token === code) { code = ''; }

            continue;
        }

        if ((parentheses || angles) && !['(', ')', '<', '>'].includes(token)) {
            continue;
        }

        if (/^\*+$/.test(token) && /(?:^|\n) {0,3}$/.test(text.slice(Math.max(0, match.index - 4), match.index))
            && (token === '*' && /\s/.test(text[match.index + 1] ?? '')
                || token.length >= 3 && /^[ \t]*(?:\r?\n|$)/.test(text.slice(match.index + token.length)))) {
            continue;
        }

        if (token.startsWith('`')) {
            code = token;
        } else if (['[', '(', '<'].includes(token)) {
            stack.push(token);

            if (token === '(') { parentheses++; }

            if (token === '<') { angles++; }
        } else if ([']', ')', '>'].includes(token)) {
            // 块引用不属于行内尖括号结构。
            if (token === '>' && !angles) { continue; }

            if (stack.pop() !== ({ ']': '[', ')': '(', '>': '<' } as Record<string, string>)[token]) { return false; }

            if (token === ')') { parentheses--; }

            if (token === '>') { angles--; }
        } else if (stack.at(-1) === token) {
            stack.pop();
        } else {
            stack.push(token);
        }
    }

    return !code && !stack.length;
}

function markdownBlocks(text: string, maxBytes: number, segmentMax: number): ReplyPart[] {
    const result: ReplyPart[] = [];
    let prefixChars = 0;
    let block = '';
    let inline = '';
    let safe = true;
    let fence = '';
    let blank = false;

    for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
        if (!fence && blank && line.trim() && block.trim()) {
            result.push({ text: block, markdown: safe && completeInlineMarkdown(inline, segmentMax) });
            prefixChars += block.length;

            // UTF-8 字节不少于 UTF-16 长度；前缀已超限时，后续段落不会参与投递。
            if (prefixChars > maxBytes) { return result; }

            block = '';
            inline = '';
            safe = true;
        }

        block += line;
        const marker = /^ {0,3}(`{3,}|~{3,})(.*)/.exec(line);

        if (fence) {
            // 只有整行都是闭合标记时才能结束代码围栏。
            safe &&= !line.includes('![');

            if (marker && marker[1]![0] === fence[0] && marker[1]!.length >= fence.length && !marker[2]!.trim()) {
                fence = '';
            }
        } else if (marker) {
            safe &&= completeInlineMarkdown(inline, segmentMax) && !line.includes('![')
                && !(marker[1]![0] === '`' && marker[2]!.includes('`'));
            inline = '';
            fence = marker[1]!;
        } else {
            inline += line;
        }

        blank = !line.trim();
    }

    if (block) { result.push({ text: block, markdown: safe && !fence && completeInlineMarkdown(inline, segmentMax) }); }

    return result;
}

function splitParts(blocks: ReplyPart[], config: Config, lengthFinish: boolean): ReplyPart[] {
    checkOutput(config);
    const segmentMax = config.qq.maxSegmentUtf8Bytes;
    const totalMax = Math.min(config.qq.outputHardLimit, segmentMax * config.qq.maxReplySegments);
    const parts: Array<ReplyPart & { size: number }> = [];
    let used = 0;
    let truncated = lengthFinish;

    outer: for (const block of blocks) {
        // 纯文本或必然超出单段上限的块直接逐码点拆分，避免为其编码全文。
        const size = block.markdown && block.text.length <= segmentMax ? bytes(block.text) : segmentMax + 1;
        let last = parts.at(-1);
        const blankLast = last && !last.text.trim();

        // 大小允许时保留完整段落，代码围栏块也不拆分。
        if (size <= segmentMax && used + size <= totalMax) {
            if (last && (last.markdown || blankLast) && last.size + size <= segmentMax) {
                last.text += block.text;
                last.markdown = true;
                last.size += size;
                used += size;
                continue;
            }

            if (!blankLast && parts.length < config.qq.maxReplySegments) {
                parts.push({ ...block, size });
                used += size;
                continue;
            }
        }

        // 过长、不完整或被截断的结构按原文发送，不补造闭合或重新打开的标记。
        for (const point of block.text) {
            const width = pointBytes(point);

            if (used + width > totalMax) {
                truncated = true;
                break outer;
            }

            if (!last || last.size + width > segmentMax) {
                // 纯空白片段须合并正文或截断提示，不能单独发送。
                if (parts.length >= config.qq.maxReplySegments || (last && !last.text.trim())) {
                    truncated = true;
                    break outer;
                }

                last = { text: '', markdown: false, size: 0 };
                parts.push(last);
            }

            last.markdown = false;
            last.text += point;
            last.size += width;
            used += width;
        }
    }

    if (truncated) {
        const hintSize = bytes(INCOMPLETE);
        let last = parts.at(-1);

        while (last && (last.size + hintSize > segmentMax || used + hintSize > totalMax)) {
            const points = Array.from(last.text);
            let end = points.length;

            while (end && (last.size + hintSize > segmentMax || used + hintSize > totalMax)) {
                const size = pointBytes(points[--end]!);
                last.size -= size;
                used -= size;
                last.markdown = false;
            }

            last.text = points.slice(0, end).join('');

            if (!last.text) {
                parts.pop();
                last = parts.at(-1);
            }
        }

        if (!last) {
            last = { text: '', markdown: false, size: 0 };
            parts.push(last);
        }

        last.text += INCOMPLETE;
    }

    return parts.map(({ text, markdown }) => ({ text, markdown }));
}

export function splitOutput(text: string, config: Config, lengthFinish = false): string[] {
    return splitParts([{ text, markdown: false }], config, lengthFinish).map(part => part.text);
}

export function splitMarkdownOutput(text: string, config: Config, lengthFinish = false): ReplyPart[] {
    // 尾部空白不单独占用回复条数，也不因此添加截断提示。
    const maxBytes = Math.min(config.qq.outputHardLimit, config.qq.maxSegmentUtf8Bytes * config.qq.maxReplySegments);

    return splitParts(markdownBlocks(text.trimEnd(), maxBytes, config.qq.maxSegmentUtf8Bytes), config, lengthFinish);
}

export interface History { rounds: Round[]; lengths: number[]; chars: number }

// 长度仅随本次历史快照传递，不进入保存的聊天正文。
export function readHistory(rounds: Round[], config: Config): History {
    const lengths = rounds.map(round => chars(round.user) + chars(round.assistant));

    return trimHistory({ rounds, lengths, chars: lengths.reduce((sum, length) => sum + length, 0) }, config);
}

export function trimHistory(history: History, config: Config): History {
    let start = 0;
    let count = history.chars;

    while (start < history.rounds.length && (history.rounds.length - start > config.qq.historyMaxTurns || count > config.qq.historyMaxChars)) {
        count -= history.lengths[start++]!;
    }

    return start ? { rounds: history.rounds.slice(start), lengths: history.lengths.slice(start), chars: count } : history;
}
