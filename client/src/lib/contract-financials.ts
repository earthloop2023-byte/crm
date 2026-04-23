type MaybeNumber = number | string | null | undefined;
type MaybeText = string | null | undefined;

type FinancialContractLike = {
  id?: string | null;
  cost?: MaybeNumber;
  invoiceIssued?: string | boolean | null | undefined;
  productDetailsJson?: string | null | undefined;
};

type FinancialItemLike = {
  id?: string | null;
  productName?: string | null;
  userIdentifier?: string | null;
  vatType?: string | null;
  supplyAmount?: MaybeNumber;
  grossSupplyAmount?: MaybeNumber;
  unitPrice?: MaybeNumber;
  quantity?: MaybeNumber;
  addQuantity?: MaybeNumber;
  extendQuantity?: MaybeNumber;
};

type FinancialEntryLike = {
  amount?: MaybeNumber;
  targetAmount?: MaybeNumber;
  itemId?: string | null;
  userIdentifier?: string | null;
  productName?: string | null;
};

const toNumber = (value: MaybeNumber) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeText = (value: MaybeText) => String(value ?? "").trim();

const normalizeCompactText = (value: MaybeText) => normalizeText(value).replace(/\s+/g, "");

const toWholeDown = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value + 1e-6));
};

const parseInvoiceIssued = (value: string | boolean | null | undefined) => {
  if (value === true) return true;
  if (value === false) return false;
  const normalized = normalizeCompactText(typeof value === "string" ? value : String(value ?? "")).toLowerCase();
  if (!normalized) return false;
  return ["true", "1", "y", "yes", "o", "발행", "발급", "포함", "부가세포함"].includes(normalized);
};

const normalizeVatType = (value: MaybeText, fallbackIncluded: boolean) => {
  const normalized = normalizeCompactText(value);
  if (!normalized) return fallbackIncluded ? "포함" : "미포함";
  if (["포함", "부가세포함", "과세"].includes(normalized)) return "포함";
  return "미포함";
};

export const parseContractItems = (contract: FinancialContractLike): FinancialItemLike[] => {
  const raw = contract.productDetailsJson;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const getContractItemBaseAmount = (item: FinancialItemLike) => {
  const stored = toNumber(item.supplyAmount);
  if (stored > 0) return stored;
  const quantity = Math.max(0, toNumber(item.quantity)) || Math.max(0, toNumber(item.addQuantity)) + Math.max(0, toNumber(item.extendQuantity));
  return Math.max(0, toNumber(item.unitPrice)) * Math.max(1, quantity);
};

export const getContractItemGrossAmount = (item: FinancialItemLike, fallbackIncluded = false) => {
  const stored = toNumber(item.grossSupplyAmount);
  if (stored > 0) return stored;
  const base = getContractItemBaseAmount(item);
  const vatType = normalizeVatType(item.vatType, fallbackIncluded);
  return vatType === "포함" ? base * 1.1 : base;
};

export const findMatchingContractItem = (
  contract: FinancialContractLike,
  itemId?: string | null,
  userIdentifier?: string | null,
  productName?: string | null,
) => {
  const items = parseContractItems(contract);
  const normalizedItemId = normalizeText(itemId);
  if (normalizedItemId) {
    const exact = items.find((item) => normalizeText(item.id) === normalizedItemId);
    if (exact) return exact;
  }

  const normalizedUserIdentifier = normalizeCompactText(userIdentifier);
  const normalizedProductName = normalizeCompactText(productName);
  if (!normalizedUserIdentifier && !normalizedProductName) return null;

  return (
    items.find(
      (item) =>
        (!normalizedUserIdentifier || normalizeCompactText(item.userIdentifier) === normalizedUserIdentifier) &&
        (!normalizedProductName || normalizeCompactText(item.productName) === normalizedProductName),
    ) || null
  );
};

export const getContractBaseAmount = (contract: FinancialContractLike) => {
  const items = parseContractItems(contract).filter((item) => normalizeText(item.productName));
  if (items.length > 0) {
    return items.reduce((sum, item) => sum + getContractItemBaseAmount(item), 0);
  }
  return Math.max(0, toNumber(contract.cost));
};

export const getContractGrossAmount = (contract: FinancialContractLike) => {
  const items = parseContractItems(contract).filter((item) => normalizeText(item.productName));
  if (items.length > 0) {
    return items.reduce((sum, item) => sum + getContractItemGrossAmount(item, parseInvoiceIssued(contract.invoiceIssued)), 0);
  }
  const base = getContractBaseAmount(contract);
  return parseInvoiceIssued(contract.invoiceIssued) ? base * 1.1 : base;
};

export const getFinancialTargetGrossAmount = (contract: FinancialContractLike | undefined, entry: FinancialEntryLike) => {
  const targetBaseAmount = Math.max(0, toNumber(entry.targetAmount));
  if (!contract) return targetBaseAmount;

  const matchedItem = findMatchingContractItem(contract, entry.itemId, entry.userIdentifier, entry.productName);
  if (matchedItem) {
    const itemBase = getContractItemBaseAmount(matchedItem);
    const itemGross = getContractItemGrossAmount(matchedItem, parseInvoiceIssued(contract.invoiceIssued));
    if (targetBaseAmount > 0 && itemBase > 0) {
      return toWholeDown((targetBaseAmount / itemBase) * itemGross);
    }
    return toWholeDown(itemGross);
  }

  const contractBase = getContractBaseAmount(contract);
  const contractGross = getContractGrossAmount(contract);
  if (targetBaseAmount > 0 && contractBase > 0) {
    return toWholeDown((targetBaseAmount / contractBase) * contractGross);
  }
  return toWholeDown(contractGross);
};

export const getFinancialAmountWithVat = (contract: FinancialContractLike | undefined, entry: FinancialEntryLike) => {
  const amount = Math.max(0, toNumber(entry.amount));
  if (amount <= 0) return 0;
  if (!contract) return toWholeDown(amount);

  const matchedItem = findMatchingContractItem(contract, entry.itemId, entry.userIdentifier, entry.productName);
  if (matchedItem) {
    const itemBase = getContractItemBaseAmount(matchedItem);
    const itemGross = getContractItemGrossAmount(matchedItem, parseInvoiceIssued(contract.invoiceIssued));
    const effectiveTargetBase = Math.max(0, toNumber(entry.targetAmount)) || itemBase;
    if (effectiveTargetBase > 0 && itemBase > 0) {
      const scaledGrossTarget = Math.max(
        getFinancialTargetGrossAmount(contract, entry),
        toWholeDown((effectiveTargetBase / itemBase) * itemGross),
      );
      return toWholeDown((amount / effectiveTargetBase) * scaledGrossTarget);
    }
  }

  const contractBase = Math.max(0, toNumber(entry.targetAmount)) || getContractBaseAmount(contract);
  const contractGross = Math.max(getFinancialTargetGrossAmount(contract, entry), getContractGrossAmount(contract));
  if (contractBase > 0) {
    return toWholeDown((amount / contractBase) * contractGross);
  }
  return toWholeDown(amount);
};
