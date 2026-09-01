import katex from "katex";
import { marked } from "marked";

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
  const math: Array<{ formula: string; displayMode: boolean }> = [];
  const hoist = (formula: string, displayMode: boolean) => {
    const index = math.push({ formula, displayMode }) - 1;
    const tag = displayMode ? "div" : "span";
    return `<${tag} data-atlas-math="${index}"></${tag}>`;
  };

  const withMathPlaceholders = text
    .replace(/(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$/g, (_match, formula: string) =>
      hoist(formula, true),
    )
    .replace(/(?<!\\)\$([^\n$]+?)(?<!\\)\$/g, (_match, formula: string) =>
      hoist(formula, false),
    );

  const html = marked.parse(withMathPlaceholders, { async: false });

  return html.replace(
    /<(?:div|span) data-atlas-math="(\d+)"><\/(?:div|span)>/g,
    (_placeholder, index: string) => {
      const expression = math[Number(index)];
      return katex.renderToString(expression.formula, {
        throwOnError: false,
        displayMode: expression.displayMode,
      });
    },
  );
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
