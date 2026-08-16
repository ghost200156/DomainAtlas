function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderMarkdown(text: string): string {
  // Strip question number prefixes and convert markdown
  let html = escapeHtml(text)
    .replace(/^题\d+[：:]\s*/gm, '')
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_: string, _lang: string, code: string) =>
      `<pre><code>${code.trim()}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  // ## Heading → <h4>
  html = html.replace(/^## (.+)$/gm, '<h4 class="dossier-h4">$1</h4>');
  // ### Sub-heading → <h5>
  html = html.replace(/^### (.+)$/gm, '<h5 class="dossier-h5">$1</h5>');
  // **bold** → <strong>
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Double newline = paragraph break, single newline = line break
  html = html.replace(/\n{2,}/g, '</p><p>');
  html = html.replace(/\n/g, '<br/>');
  return `<p>${html}</p>`;
}
