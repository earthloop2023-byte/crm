const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
const HANGUL_CYCLE = 21 * 28;

const CHOSEONG = [
  "\u3131", // ㄱ
  "\u3132", // ㄲ
  "\u3134", // ㄴ
  "\u3137", // ㄷ
  "\u3138", // ㄸ
  "\u3139", // ㄹ
  "\u3141", // ㅁ
  "\u3142", // ㅂ
  "\u3143", // ㅃ
  "\u3145", // ㅅ
  "\u3146", // ㅆ
  "\u3147", // ㅇ
  "\u3148", // ㅈ
  "\u3149", // ㅉ
  "\u314a", // ㅊ
  "\u314b", // ㅋ
  "\u314c", // ㅌ
  "\u314d", // ㅍ
  "\u314e", // ㅎ
];

const SEARCH_SEPARATOR_PATTERN = /[\s\-_/.,()[\]{}]+/g;
const CHOSEONG_PATTERN = /^[\u3131-\u314e]+$/;

function normalizeBase(value: string): string {
  return value.toLowerCase().replace(SEARCH_SEPARATOR_PATTERN, "").trim();
}

export function normalizeKoreanSearchText(value: unknown): string {
  return normalizeBase(String(value ?? ""));
}

export function extractChoseongText(value: unknown): string {
  const raw = String(value ?? "");
  let result = "";

  for (const char of raw) {
    const code = char.charCodeAt(0);
    if (code >= HANGUL_START && code <= HANGUL_END) {
      const index = Math.floor((code - HANGUL_START) / HANGUL_CYCLE);
      result += CHOSEONG[index] ?? "";
      continue;
    }

    if (code >= 0x3131 && code <= 0x314e) {
      result += char;
      continue;
    }

    if (/[\da-z]/i.test(char)) {
      result += char.toLowerCase();
    }
  }

  return normalizeBase(result);
}

export function matchesKoreanSearch(targets: Array<unknown>, query: unknown): boolean {
  const rawQuery = String(query ?? "");
  const normalizedQuery = normalizeKoreanSearchText(rawQuery);
  if (!normalizedQuery) return true;

  const compactRawQuery = rawQuery.replace(SEARCH_SEPARATOR_PATTERN, "");
  const choseongQuery = extractChoseongText(rawQuery);
  const isChoseongQuery = CHOSEONG_PATTERN.test(compactRawQuery);

  return targets.some((target) => {
    const normalizedTarget = normalizeKoreanSearchText(target);
    if (normalizedTarget.includes(normalizedQuery)) {
      return true;
    }

    if (!isChoseongQuery || !choseongQuery) {
      return false;
    }

    return extractChoseongText(target).includes(choseongQuery);
  });
}
