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
    .replace(/^(?:题目?\d+|问题\d*)[：:．.\s]\s*/gm, "")
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_: string, _lang: string, code: string) =>
      `<pre><code>${code.trim()}</code></pre>`)
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/^## (.+)$/gm, '<h4 class="dossier-h4">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h5 class="dossier-h5">$1</h5>');
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\n{2,}/g, "</p><p>");
  html = html.replace(/\n/g, "<br/>");
  return `<p>${html}</p>`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
