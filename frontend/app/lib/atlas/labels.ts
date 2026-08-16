const LEADING_SYMBOLS = /^[^\p{L}\p{N}]+/u;

export function cleanLabel(value: string): string {
  return value.replace(LEADING_SYMBOLS, "");
}
