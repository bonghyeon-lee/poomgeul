/**
 * ar5iv HTML → Segment[] 파서.
 *
 * ar5iv은 LaTeXML이 렌더한 안정적인 class 네이밍(ltx_*)을 쓴다. 우리는 다음
 * 덩어리만 추출한다(M0 범위):
 *
 *   - abstract(첫 p.ltx_p)
 *   - body 단락: section.ltx_section 밑 p.ltx_p
 *   - 블록 수식: div.ltx_equation* 또는 table.ltx_equation
 *   - 참고문헌: li.ltx_bibitem (bibliography 섹션 안)
 *   - 각주: span.ltx_note.ltx_role_footnote (본문에 흩어져 있음)
 *
 * M0 비범위: 캡션 수집(find하면 body로 flatten), 섹션 제목, 수식 MathML 원형 보존,
 * 표 내부 텍스트, 저자/affiliation 블록.
 *
 * 파싱은 cheerio/parse5 없이 정규식으로 한다. ar5iv HTML은 class 네이밍이 평탄해
 * 이 범위에서는 DOM 파싱 없이도 충분히 좋은 근사가 가능하다. 정확도가 중요해지면
 * (표 안의 문장 분할, 중첩 footnote 등) ADR로 parse5 도입을 기록하고 교체한다.
 */

export type ParsedSegmentKind = "body" | "caption" | "footnote" | "reference";

export type ParsedSegment = {
  order: number;
  kind: ParsedSegmentKind;
  text: string;
};

export type ParseOptions = {
  /** 문장당 최소 글자 수 — 이보다 짧으면 노이즈로 보고 버린다. */
  minChars?: number;
};

const DEFAULT_MIN_CHARS = 8;

export function parseAr5ivHtml(html: string, options: ParseOptions = {}): ParsedSegment[] {
  const minChars = options.minChars ?? DEFAULT_MIN_CHARS;
  const segments: ParsedSegment[] = [];
  let order = 0;

  // 1. head 제거(스크립트/스타일/메타 노이즈 제거)
  const body = stripTag(html, "head") ?? html;
  // 2. 스크립트·스타일 블록 제거
  const cleaned = removeBlocks(body, ["script", "style", "noscript"]);

  // 3. abstract — div.ltx_abstract 내부의 첫 p.ltx_p 한 개로 충분
  const abstractMatch = cleaned.match(
    /<div[^>]*class="[^"]*ltx_abstract[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  );
  if (abstractMatch) {
    const abstractInner = abstractMatch[1]!;
    const abstractParagraphs = extractParagraphs(abstractInner);
    for (const para of abstractParagraphs) {
      for (const sentence of splitSentences(para)) {
        if (sentence.length < minChars) continue;
        segments.push({ order: order++, kind: "body", text: sentence });
      }
    }
  }

  // 4. bibliography 분리 — 이 섹션 안의 p.ltx_p는 body가 아니라 reference.
  const bibMatch = cleaned.match(
    /<section[^>]*class="[^"]*ltx_bibliography[^"]*"[^>]*>([\s\S]*?)<\/section>/i,
  );
  const bibInner = bibMatch?.[1] ?? "";
  const bodyRegion = bibMatch ? cleaned.replace(bibMatch[0]!, "") : cleaned;

  // abstract는 이미 수집했으므로 body 수집 시 abstract 블록은 제거한다.
  const bodyWithoutAbstract = abstractMatch
    ? bodyRegion.replace(abstractMatch[0]!, "")
    : bodyRegion;

  // 5. 본문 블록 수식 — div.ltx_equation / table.ltx_equation(group) — 원문 그대로.
  // 수식 블록을 먼저 뽑고 자리를 마커로 치환해 문단 수집 시 놓치지 않게 한다.
  const equationSegments: Array<{ text: string }> = [];
  const withEquationMarkers = bodyWithoutAbstract.replace(
    /<(?:div|table)[^>]*class="[^"]*ltx_equation(?:group)?[^"]*"[^>]*>[\s\S]*?<\/(?:div|table)>/gi,
    (match) => {
      const text = collapseWhitespace(stripTags(match));
      if (text.length >= minChars) equationSegments.push({ text });
      return "<!--EQ-->";
    },
  );

  // 6. body 단락 — p.ltx_p 전체에서 문장 분리.
  const bodyParagraphs = extractParagraphs(withEquationMarkers);
  for (const para of bodyParagraphs) {
    for (const sentence of splitSentences(para)) {
      if (sentence.length < minChars) continue;
      segments.push({ order: order++, kind: "body", text: sentence });
    }
  }

  // 7. 블록 수식을 body 끝에 덧붙인다(kind=body, 번역 안 함은 상위에서 다른 규칙으로).
  //    M0 스펙상 '원문 그대로, 번역 안 함'이지만 kind 컬럼에는 body로 넣는다 — 수식만의
  //    kind는 스키마에 없다. 상위에서 TranslationSegment를 만들 때 text를 그대로 복사.
  for (const eq of equationSegments) {
    segments.push({ order: order++, kind: "body", text: eq.text });
  }

  // 8. bibliography — li.ltx_bibitem 각각이 reference.
  if (bibInner) {
    const items = bibInner.matchAll(
      /<li[^>]*class="[^"]*ltx_bibitem[^"]*"[^>]*>([\s\S]*?)<\/li>/gi,
    );
    for (const m of items) {
      const text = collapseWhitespace(stripTags(m[1]!));
      if (text.length < minChars) continue;
      segments.push({ order: order++, kind: "reference", text });
    }
  }

  // 9. 각주 — span.ltx_note.ltx_role_footnote (ar5iv은 note_content 내부에 실제 텍스트).
  const footnoteRegex = /<span[^>]*class="[^"]*ltx_note_content[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  for (const m of cleaned.matchAll(footnoteRegex)) {
    const text = collapseWhitespace(stripTags(m[1]!));
    if (text.length < minChars) continue;
    // 노이즈 줄이기: "footnotemark:" 같은 레이블 반복은 건너뛴다.
    if (/^\d+$/.test(text)) continue;
    // ar5iv는 inline 링크 각주의 경우 ltx_note_content를 "1 footnotemark:"처럼 마커 문자열만으로
    // 채운다. 실제 각주 내용이 아니므로 버린다. 실제 내용이 이어지면 그건 살린다.
    if (/^\d+\s*footnotemark\s*:?\s*$/i.test(text)) continue;
    segments.push({ order: order++, kind: "footnote", text });
  }

  return segments;
}

/**
 * p.ltx_p 추출 후 인라인 치환과 공백 정규화까지 한 번에.
 */
function extractParagraphs(html: string): string[] {
  const paragraphs: string[] = [];
  const regex = /<p[^>]*class="[^"]*ltx_p[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
  for (const m of html.matchAll(regex)) {
    const inner = m[1]!;
    // 인라인 <math>...</math>는 문장 경계 오인 방지 placeholder(⟦MATH⟧)로.
    const mathStripped = inner.replace(/<math[\s\S]*?<\/math>/gi, " ⟦MATH⟧ ");
    const text = collapseWhitespace(stripTags(mathStripped));
    if (text.length === 0) continue;
    paragraphs.push(text);
  }
  return paragraphs;
}

function stripTag(html: string, tagName: string): string | null {
  const re = new RegExp(`<${tagName}[^>]*>[\\s\\S]*?<\\/${tagName}>`, "i");
  return html.replace(re, "");
}

function removeBlocks(html: string, tags: string[]): string {
  let out = html;
  for (const tag of tags) {
    out = out.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), "");
  }
  return out;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * 영어 본문 문장 분할. 완벽이 아니라 "대부분 맞게" 목표.
 * 인라인 수식 placeholder ⟦MATH⟧가 포함된 문장도 정상 처리되도록 구두점 후 공백/대문자
 * 를 경계로 본다.
 */
const ABBREVIATIONS = new Set([
  "e.g.",
  "i.e.",
  "cf.",
  "vs.",
  "etc.",
  "fig.",
  "eq.",
  "no.",
  "vol.",
  "pp.",
  "mr.",
  "ms.",
  "dr.",
  "prof.",
  "st.",
  "jr.",
  "sr.",
  "inc.",
]);

export function splitSentences(text: string): string[] {
  if (!text) return [];
  const sentences: string[] = [];
  let buffer = "";
  const chars = Array.from(text);

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]!;
    buffer += ch;
    if (ch !== "." && ch !== "!" && ch !== "?") continue;

    const next = chars[i + 1];
    const afterNext = chars[i + 2];
    // 문장 끝 판정: 다음 문자가 공백이고 그 다음이 대문자/따옴표거나, 문서 끝.
    // 주의: `(`로 시작하는 이어짐은 학술 인용 `Author et al. (YEAR)` 패턴일 가능성이
    // 크므로 경계로 보지 않는다. 그런 인용은 앞 문장에 이어 붙여야 한다.
    const endOfText = next === undefined;
    const peekIsSpace = next === " " || next === "\t" || next === "\n";
    const peekIsBoundary =
      endOfText ||
      (peekIsSpace &&
        (afterNext === undefined || /[A-Z0-9§⟦"'“‘[]/.test(afterNext) || afterNext === " "));

    if (!peekIsBoundary) continue;

    // 약어 체크: 버퍼의 끝 단어가 known abbreviation이면 경계 아님.
    const tailWord = buffer.match(/([A-Za-z.]+\.)\s*$/);
    if (tailWord && ABBREVIATIONS.has(tailWord[1]!.toLowerCase())) continue;

    // 괜찮으면 문장 하나 완성.
    sentences.push(buffer.trim());
    buffer = "";
  }

  const remainder = buffer.trim();
  if (remainder) sentences.push(remainder);

  // 사후 병합: "( 2022 ) something" 또는 "(2022) ..."처럼 여는 괄호로 시작하는
  // 조각은 대개 인용이 앞 문장에서 끊긴 경우. 직전 문장에 다시 이어 붙인다.
  return mergeCitationFragments(sentences);
}

const CITATION_FRAGMENT_RE = /^\(\s*\d/;

function mergeCitationFragments(sentences: string[]): string[] {
  if (sentences.length <= 1) return sentences;
  const out: string[] = [];
  for (const s of sentences) {
    if (out.length > 0 && CITATION_FRAGMENT_RE.test(s)) {
      out[out.length - 1] = `${out[out.length - 1]} ${s}`;
      continue;
    }
    out.push(s);
  }
  return out;
}
