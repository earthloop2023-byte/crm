export function getKoreanNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}

function toDate(input: Date | string | number): Date {
  return input instanceof Date ? input : new Date(input);
}

export function getKoreanDateKey(input: Date | string | number): string {
  const date = toDate(input);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function isWithinKoreanDateRange(
  input: Date | string | number,
  startDate: Date,
  endDate: Date,
): boolean {
  const targetKey = getKoreanDateKey(input);
  const startKey = getKoreanDateKey(startDate);
  const endKey = getKoreanDateKey(endDate);
  if (!targetKey || !startKey || !endKey) return false;

  const rangeStart = startKey <= endKey ? startKey : endKey;
  const rangeEnd = startKey <= endKey ? endKey : startKey;
  return targetKey >= rangeStart && targetKey <= rangeEnd;
}

export function getKoreanToday(): Date {
  const d = getKoreanNow();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getKoreanEndOfDay(): Date {
  const d = getKoreanNow();
  d.setHours(23, 59, 59, 999);
  return d;
}

export function getKoreanDaysAgo(days: number): Date {
  const d = getKoreanNow();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getKoreanStartOfYear(year?: number): Date {
  const now = getKoreanNow();
  const y = year ?? now.getFullYear();
  return new Date(y, 0, 1);
}

export function getKoreanEndOfYear(year?: number): Date {
  const now = getKoreanNow();
  const y = year ?? now.getFullYear();
  return new Date(y, 11, 31, 23, 59, 59, 999);
}
