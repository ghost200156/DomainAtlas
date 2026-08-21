// Hoisted at module level to avoid recompiling on every renderMarkdown call
const RE_QUESTION_PREFIX = /^(?:题目?\d+|问题\d*)[：:．.\s]\s*/gm;
const RE_CODE_BLOCK = /```(\w*)\n([\s\S]*?)```/g;
const RE_INLINE_CODE = /`([^`]+)`/g;
const RE_H4 = /^## (.+)$/gm;
const RE_H5 = /^### (.+)$/gm;
const RE_BOLD = /\*\*(.+?)\*\*/g;
const RE_DOUBLE_NL = /\n{2,}/g;
const RE_NL = /\n/g;

const LEADING_SYMBOLS = /^[^\p{L}\p{N}]+/u;

export const RELATION_LABELS: Record<string, string> = {
  enables: "促成",
  constrains: "约束",
  informs: "支撑",
  evaluates: "检验",
  depends_on: "依赖",
};

export function cleanLabel(value: string) {
  return value.replace(LEADING_SYMBOLS, "");
}

export function renderMarkdown(text: string): string {
  let html = text
    .replace(RE_QUESTION_PREFIX, "")
    .replace(RE_CODE_BLOCK, (_: string, _lang: string, code: string) =>
      `<pre><code>${code.trim()}</code></pre>`)
    .replace(RE_INLINE_CODE, "<code>$1</code>");
  html = html.replace(RE_H4, '<h4 class="dossier-h4">$1</h4>');
  html = html.replace(RE_H5, '<h5 class="dossier-h5">$1</h5>');
  html = html.replace(RE_BOLD, "<strong>$1</strong>");
  html = html.replace(RE_DOUBLE_NL, "</p><p>");
  html = html.replace(RE_NL, "<br/>");
  return `<p>${html}</p>`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
