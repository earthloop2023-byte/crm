const KOREAN_PUBLIC_HOLIDAY_KEYS = new Set<string>([
  "2020-01-01",
  "2020-01-24",
  "2020-01-25",
  "2020-01-26",
  "2020-01-27",
  "2020-03-01",
  "2020-04-15",
  "2020-04-30",
  "2020-05-05",
  "2020-06-06",
  "2020-08-15",
  "2020-08-17",
  "2020-09-30",
  "2020-10-01",
  "2020-10-02",
  "2020-10-03",
  "2020-10-09",
  "2020-12-25",
  "2021-01-01",
  "2021-02-11",
  "2021-02-12",
  "2021-02-13",
  "2021-03-01",
  "2021-05-05",
  "2021-05-19",
  "2021-06-06",
  "2021-08-15",
  "2021-08-16",
  "2021-09-20",
  "2021-09-21",
  "2021-09-22",
  "2021-10-03",
  "2021-10-04",
  "2021-10-09",
  "2021-10-11",
  "2021-12-25",
  "2022-01-01",
  "2022-01-31",
  "2022-02-01",
  "2022-02-02",
  "2022-03-01",
  "2022-03-09",
  "2022-05-05",
  "2022-05-08",
  "2022-06-01",
  "2022-06-06",
  "2022-08-15",
  "2022-09-09",
  "2022-09-10",
  "2022-09-11",
  "2022-09-12",
  "2022-10-03",
  "2022-10-09",
  "2022-10-10",
  "2022-12-25",
  "2023-01-01",
  "2023-01-21",
  "2023-01-22",
  "2023-01-23",
  "2023-01-24",
  "2023-03-01",
  "2023-05-05",
  "2023-05-27",
  "2023-05-29",
  "2023-06-06",
  "2023-08-15",
  "2023-09-28",
  "2023-09-29",
  "2023-09-30",
  "2023-10-02",
  "2023-10-03",
  "2023-10-09",
  "2023-12-25",
  "2024-01-01",
  "2024-02-09",
  "2024-02-10",
  "2024-02-11",
  "2024-02-12",
  "2024-03-01",
  "2024-04-10",
  "2024-05-05",
  "2024-05-06",
  "2024-05-15",
  "2024-06-06",
  "2024-08-15",
  "2024-09-16",
  "2024-09-17",
  "2024-09-18",
  "2024-10-01",
  "2024-10-03",
  "2024-10-09",
  "2024-12-25",
  "2025-01-01",
  "2025-01-27",
  "2025-01-28",
  "2025-01-29",
  "2025-01-30",
  "2025-03-01",
  "2025-03-03",
  "2025-05-05",
  "2025-05-06",
  "2025-06-03",
  "2025-06-06",
  "2025-08-15",
  "2025-10-03",
  "2025-10-05",
  "2025-10-06",
  "2025-10-07",
  "2025-10-08",
  "2025-10-09",
  "2025-12-25",
  "2026-01-01",
  "2026-02-16",
  "2026-02-17",
  "2026-02-18",
  "2026-03-01",
  "2026-03-02",
  "2026-05-05",
  "2026-05-24",
  "2026-05-25",
  "2026-06-03",
  "2026-06-06",
  "2026-08-15",
  "2026-08-17",
  "2026-09-24",
  "2026-09-25",
  "2026-09-26",
  "2026-10-03",
  "2026-10-05",
  "2026-10-09",
  "2026-12-25",
  "2027-01-01",
  "2027-02-06",
  "2027-02-07",
  "2027-02-08",
  "2027-02-09",
  "2027-03-01",
  "2027-05-05",
  "2027-05-13",
  "2027-06-06",
  "2027-08-15",
  "2027-08-16",
  "2027-09-14",
  "2027-09-15",
  "2027-09-16",
  "2027-10-03",
  "2027-10-04",
  "2027-10-09",
  "2027-10-11",
  "2027-12-25",
  "2027-12-27",
  "2028-01-01",
  "2028-01-26",
  "2028-01-27",
  "2028-01-28",
  "2028-03-01",
  "2028-04-12",
  "2028-05-02",
  "2028-05-05",
  "2028-06-06",
  "2028-08-15",
  "2028-10-02",
  "2028-10-03",
  "2028-10-04",
  "2028-10-05",
  "2028-10-09",
  "2028-12-25",
  "2029-01-01",
  "2029-02-12",
  "2029-02-13",
  "2029-02-14",
  "2029-03-01",
  "2029-05-05",
  "2029-05-07",
  "2029-05-20",
  "2029-05-21",
  "2029-06-06",
  "2029-08-15",
  "2029-09-21",
  "2029-09-22",
  "2029-09-23",
  "2029-09-24",
  "2029-10-03",
  "2029-10-09",
  "2029-12-25",
  "2030-01-01",
  "2030-02-02",
  "2030-02-03",
  "2030-02-04",
  "2030-02-05",
  "2030-03-01",
  "2030-04-03",
  "2030-05-05",
  "2030-05-06",
  "2030-05-09",
  "2030-06-06",
  "2030-06-12",
  "2030-08-15",
  "2030-09-11",
  "2030-09-12",
  "2030-09-13",
  "2030-10-03",
  "2030-10-09",
  "2030-12-25",
  "2031-01-01",
  "2031-01-22",
  "2031-01-23",
  "2031-01-24",
  "2031-03-01",
  "2031-03-03",
  "2031-05-05",
  "2031-05-28",
  "2031-06-06",
  "2031-08-15",
  "2031-09-30",
  "2031-10-01",
  "2031-10-02",
  "2031-10-03",
  "2031-10-09",
  "2031-12-25",
  "2032-01-01",
  "2032-02-10",
  "2032-02-11",
  "2032-02-12",
  "2032-03-01",
  "2032-04-14",
  "2032-05-05",
  "2032-05-16",
  "2032-05-17",
  "2032-06-06",
  "2032-08-15",
  "2032-08-16",
  "2032-09-18",
  "2032-09-19",
  "2032-09-20",
  "2032-09-21",
  "2032-10-03",
  "2032-10-04",
  "2032-10-09",
  "2032-10-11",
  "2032-12-25",
  "2032-12-27",
  "2033-01-01",
  "2033-01-30",
  "2033-01-31",
  "2033-02-01",
  "2033-02-02",
  "2033-03-01",
  "2033-05-05",
  "2033-05-06",
  "2033-06-06",
  "2033-08-15",
  "2033-09-07",
  "2033-09-08",
  "2033-09-09",
  "2033-10-03",
  "2033-10-09",
  "2033-10-10",
  "2033-12-25",
  "2033-12-26",
  "2034-01-01",
  "2034-02-18",
  "2034-02-19",
  "2034-02-20",
  "2034-02-21",
  "2034-03-01",
  "2034-05-05",
  "2034-05-25",
  "2034-06-06",
  "2034-06-14",
  "2034-08-15",
  "2034-09-26",
  "2034-09-27",
  "2034-09-28",
  "2034-10-03",
  "2034-10-09",
  "2034-12-25",
  "2035-01-01",
  "2035-02-07",
  "2035-02-08",
  "2035-02-09",
  "2035-03-01",
  "2035-04-04",
  "2035-05-05",
  "2035-05-07",
  "2035-05-15",
  "2035-06-06",
  "2035-08-15",
  "2035-09-15",
  "2035-09-16",
  "2035-09-17",
  "2035-09-18",
  "2035-10-03",
  "2035-10-09",
  "2035-12-25",
]);

const KOREA_TIME_ZONE = "Asia/Seoul";

function buildKoreanDateFromKey(dateKey: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const date = new Date(`${dateKey}T12:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getKoreanDateParts(value: Date | string | number): { year: string; month: string; day: string } | null {
  const date =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? buildKoreanDateFromKey(value)
      : new Date(value);
  if (!date || Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return null;
  return { year, month, day };
}

export function getKoreanBusinessDateKey(value: Date | string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const parts = getKoreanDateParts(value as Date | string | number);
  if (!parts) return null;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function normalizeToKoreanDateOnly(value: Date | string | number | null | undefined): Date | null {
  const dateKey = getKoreanBusinessDateKey(value);
  return dateKey ? buildKoreanDateFromKey(dateKey) : null;
}

export function isKoreanPublicHoliday(value: Date | string | number | null | undefined): boolean {
  const dateKey = getKoreanBusinessDateKey(value);
  return Boolean(dateKey && KOREAN_PUBLIC_HOLIDAY_KEYS.has(dateKey));
}

export function isKoreanWeekend(value: Date | string | number | null | undefined): boolean {
  const normalized = normalizeToKoreanDateOnly(value);
  if (!normalized) return false;
  const dayOfWeek = normalized.getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

export function isKoreanBusinessDay(value: Date | string | number | null | undefined): boolean {
  const normalized = normalizeToKoreanDateOnly(value);
  if (!normalized) return false;
  return !isKoreanWeekend(normalized) && !isKoreanPublicHoliday(normalized);
}

export function addKoreanBusinessDays(
  value: Date | string | number | null | undefined,
  businessDayDelta: number,
): Date | null {
  const normalized = normalizeToKoreanDateOnly(value);
  if (!normalized) return null;

  const remainingDays = Math.trunc(Math.abs(businessDayDelta));
  if (remainingDays === 0) return normalized;

  const direction = businessDayDelta > 0 ? 1 : -1;
  let remaining = remainingDays;
  let cursor = normalized;

  while (remaining > 0) {
    const next = new Date(cursor);
    next.setUTCDate(next.getUTCDate() + direction);
    const nextNormalized = normalizeToKoreanDateOnly(next);
    if (!nextNormalized) return null;
    cursor = nextNormalized;
    if (!isKoreanBusinessDay(cursor)) continue;
    remaining -= 1;
  }

  return cursor;
}
