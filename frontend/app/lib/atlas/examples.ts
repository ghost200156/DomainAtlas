export type QAPair = { q: string; a: string };

export function parseExamples(text: string): QAPair[] {
  // Split by blank line before 【解】 markers
  // Split into Q&A pairs: split by 【解】, pair questions with answers
  const segments = text.split(/【解】/);
  const pairs: QAPair[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i].trim();
    if (!seg) continue;
    if (i === 0) {
      pairs.push({q: seg, a: ''});
    } else {
      // This segment contains: answer for previous Q + possibly next question
      const nextQIdx = seg.search(/\n(?=题\d|判断|代码|\d+\.)/);
      if (nextQIdx >= 0) {
        if (pairs.length > 0) pairs[pairs.length - 1].a = seg.slice(0, nextQIdx).trim();
        pairs.push({q: seg.slice(nextQIdx).trim(), a: ''});
      } else {
        if (pairs.length > 0) pairs[pairs.length - 1].a = seg;
      }
    }
  }
  return pairs;
}
