export const REGIONAL_CUSTOMER_LIST_META_PREFIX = "[[RCL_META_V1]]";

export const REGIONAL_CUSTOMER_LIST_TIERS = ["1000", "500", "300", "100"] as const;

export type RegionalCustomerListTier = (typeof REGIONAL_CUSTOMER_LIST_TIERS)[number];

export type RegionalCustomerListDetailCategory = "exposure" | "blog" | "custom";

export type RegionalCustomerListDetailColumn = {
  key: string;
  label: string;
  category: RegionalCustomerListDetailCategory;
};

export type RegionalCustomerListDetailState = Record<string, boolean>;

export type RegionalCustomerListColumnConfig = Record<
  RegionalCustomerListTier,
  RegionalCustomerListDetailColumn[]
>;

type RegionalCustomerListMetaPayload = {
  detailColumns?: RegionalCustomerListDetailState;
  timeline?: string | null;
};

const DEFAULT_REGIONAL_CUSTOMER_LIST_DETAIL_COLUMNS: RegionalCustomerListColumnConfig = {
  "1000": [
    { key: "exposureDaily", label: "노출 안내(일1회)", category: "exposure" },
    { key: "blogReviewMonthly", label: "블로그 리뷰(월1회)", category: "blog" },
  ],
  "500": [
    { key: "exposureWeek1", label: "노출 안내(1주차)", category: "exposure" },
    { key: "exposureWeek2", label: "노출 안내(2주차)", category: "exposure" },
    { key: "exposureWeek3", label: "노출 안내(3주차)", category: "exposure" },
    { key: "exposureWeek4", label: "노출 안내(4주차)", category: "exposure" },
    { key: "blogReviewRound1", label: "블로그 리뷰(1회차)", category: "blog" },
    { key: "blogReviewRound2", label: "블로그 리뷰(2회차)", category: "blog" },
  ],
  "300": [
    { key: "exposureWeek1", label: "노출 안내(1주차)", category: "exposure" },
    { key: "exposureWeek3", label: "노출 안내(3주차)", category: "exposure" },
    { key: "blogReviewRound1", label: "블로그 리뷰(1회차)", category: "blog" },
  ],
  "100": [
    { key: "exposureMonthly", label: "노출 안내(월1회)", category: "exposure" },
    { key: "blogReviewMissing", label: "블로그 리뷰(미작성)", category: "blog" },
  ],
};

function cloneRegionalCustomerListColumnConfig(
  config: RegionalCustomerListColumnConfig,
): RegionalCustomerListColumnConfig {
  return Object.fromEntries(
    REGIONAL_CUSTOMER_LIST_TIERS.map((tier) => [
      tier,
      (config[tier] || []).map((column) => ({ ...column })),
    ]),
  ) as RegionalCustomerListColumnConfig;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeBoolean(value: unknown): boolean {
  if (value === true || value === false) return value;
  if (typeof value === "number") return value !== 0;
  const normalized = normalizeText(value).toLowerCase();
  return ["true", "1", "y", "yes", "on"].includes(normalized);
}

function normalizeColumnKeyValue(value: unknown): string {
  const raw = normalizeText(value);
  if (!raw) return "";

  const cleaned = raw.replace(/[^0-9a-zA-Z가-힣]+/g, " ").trim();
  if (!cleaned) return "";

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (!words.length) return "";

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

function normalizeColumnCategory(value: unknown): RegionalCustomerListDetailCategory {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "exposure" || normalized === "blog" || normalized === "custom") {
    return normalized;
  }
  return "custom";
}

function normalizeColumn(
  value: unknown,
  existingKeys: Set<string>,
): RegionalCustomerListDetailColumn | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const rawColumn = value as Record<string, unknown>;
  const label = normalizeText(rawColumn.label);
  if (!label) {
    return null;
  }

  let key = normalizeColumnKeyValue(rawColumn.key);
  if (!key) {
    key = createRegionalCustomerListDetailColumnKey(label, existingKeys);
  } else if (existingKeys.has(key.toLowerCase())) {
    key = createRegionalCustomerListDetailColumnKey(label, existingKeys);
  }

  existingKeys.add(key.toLowerCase());

  return {
    key,
    label,
    category: normalizeColumnCategory(rawColumn.category),
  };
}

export function isRegionalCustomerListTier(value: string): value is RegionalCustomerListTier {
  return REGIONAL_CUSTOMER_LIST_TIERS.includes(value as RegionalCustomerListTier);
}

export function getDefaultRegionalCustomerListColumnConfig(): RegionalCustomerListColumnConfig {
  return cloneRegionalCustomerListColumnConfig(DEFAULT_REGIONAL_CUSTOMER_LIST_DETAIL_COLUMNS);
}

export function normalizeRegionalCustomerListColumnConfig(
  rawValue: unknown,
): RegionalCustomerListColumnConfig {
  const defaults = getDefaultRegionalCustomerListColumnConfig();
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return defaults;
  }

  const rawConfig = rawValue as Record<string, unknown>;

  return Object.fromEntries(
    REGIONAL_CUSTOMER_LIST_TIERS.map((tier) => {
      if (!Object.prototype.hasOwnProperty.call(rawConfig, tier)) {
        return [tier, defaults[tier]];
      }

      const rawColumns = rawConfig[tier];
      if (!Array.isArray(rawColumns)) {
        return [tier, defaults[tier]];
      }

      const usedKeys = new Set<string>();
      const normalizedColumns = rawColumns
        .map((column) => normalizeColumn(column, usedKeys))
        .filter((column): column is RegionalCustomerListDetailColumn => Boolean(column));

      return [tier, normalizedColumns];
    }),
  ) as RegionalCustomerListColumnConfig;
}

export function createRegionalCustomerListDetailColumnKey(
  label: string,
  existingKeys: Iterable<string> = [],
): string {
  const existingKeySet = new Set(
    Array.from(existingKeys, (key) => normalizeColumnKeyValue(key).toLowerCase()).filter(Boolean),
  );
  const baseKey = normalizeColumnKeyValue(label) || "detailColumn";

  let candidate = baseKey;
  let suffix = 2;
  while (existingKeySet.has(candidate.toLowerCase())) {
    candidate = `${baseKey}${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export function getRegionalCustomerListDetailColumns(
  tier: string,
  columnConfig?: RegionalCustomerListColumnConfig,
): readonly RegionalCustomerListDetailColumn[] {
  if (!isRegionalCustomerListTier(tier)) {
    return [];
  }

  const config = columnConfig ?? DEFAULT_REGIONAL_CUSTOMER_LIST_DETAIL_COLUMNS;
  return config[tier] || [];
}

export function buildRegionalCustomerListDetailState(
  tier: string,
  options?: {
    source?: unknown;
    exposureNotice?: boolean;
    blogReview?: boolean;
    columnConfig?: RegionalCustomerListColumnConfig;
  },
): RegionalCustomerListDetailState {
  const columns = getRegionalCustomerListDetailColumns(tier, options?.columnConfig);
  const source =
    options?.source && typeof options.source === "object" && !Array.isArray(options.source)
      ? (options.source as Record<string, unknown>)
      : {};

  return Object.fromEntries(
    columns.map((column) => [
      column.key,
      source[column.key] === undefined
        ? column.category === "exposure"
          ? Boolean(options?.exposureNotice)
          : column.category === "blog"
            ? Boolean(options?.blogReview)
            : false
        : normalizeBoolean(source[column.key]),
    ]),
  );
}

export function summarizeRegionalCustomerListDetailState(
  tier: string,
  detailColumns: unknown,
  fallback?: {
    exposureNotice?: boolean;
    blogReview?: boolean;
    columnConfig?: RegionalCustomerListColumnConfig;
  },
): {
  detailColumns: RegionalCustomerListDetailState;
  exposureNotice: boolean;
  blogReview: boolean;
} {
  const normalized = buildRegionalCustomerListDetailState(tier, {
    source: detailColumns,
    exposureNotice: fallback?.exposureNotice,
    blogReview: fallback?.blogReview,
    columnConfig: fallback?.columnConfig,
  });
  const columns = getRegionalCustomerListDetailColumns(tier, fallback?.columnConfig);

  return {
    detailColumns: normalized,
    exposureNotice: columns.some((column) => column.category === "exposure" && normalized[column.key]),
    blogReview: columns.some((column) => column.category === "blog" && normalized[column.key]),
  };
}

export function decodeRegionalCustomerListContent(
  tier: string,
  rawValue: unknown,
  fallback?: {
    exposureNotice?: boolean;
    blogReview?: boolean;
    columnConfig?: RegionalCustomerListColumnConfig;
  },
): {
  detailColumns: RegionalCustomerListDetailState;
  timeline: string | null;
} {
  const rawText = normalizeText(rawValue);
  if (!rawText.startsWith(REGIONAL_CUSTOMER_LIST_META_PREFIX)) {
    return {
      detailColumns: buildRegionalCustomerListDetailState(tier, {
        exposureNotice: fallback?.exposureNotice,
        blogReview: fallback?.blogReview,
        columnConfig: fallback?.columnConfig,
      }),
      timeline: rawText || null,
    };
  }

  try {
    const payload = JSON.parse(rawText.slice(REGIONAL_CUSTOMER_LIST_META_PREFIX.length)) as RegionalCustomerListMetaPayload;
    return {
      detailColumns: buildRegionalCustomerListDetailState(tier, {
        source: payload.detailColumns,
        exposureNotice: fallback?.exposureNotice,
        blogReview: fallback?.blogReview,
        columnConfig: fallback?.columnConfig,
      }),
      timeline: normalizeText(payload.timeline) || null,
    };
  } catch {
    return {
      detailColumns: buildRegionalCustomerListDetailState(tier, {
        exposureNotice: fallback?.exposureNotice,
        blogReview: fallback?.blogReview,
        columnConfig: fallback?.columnConfig,
      }),
      timeline: rawText || null,
    };
  }
}

export function encodeRegionalCustomerListContent(
  tier: string,
  detailColumns: unknown,
  timeline: unknown,
  fallback?: {
    exposureNotice?: boolean;
    blogReview?: boolean;
    columnConfig?: RegionalCustomerListColumnConfig;
  },
): string {
  const summary = summarizeRegionalCustomerListDetailState(tier, detailColumns, fallback);
  const payload: RegionalCustomerListMetaPayload = {
    detailColumns: summary.detailColumns,
    timeline: normalizeText(timeline) || null,
  };

  return `${REGIONAL_CUSTOMER_LIST_META_PREFIX}${JSON.stringify(payload)}`;
}
