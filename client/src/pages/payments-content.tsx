import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  Calendar as CalendarIcon,
  CheckCircle,
  Coins,
  CreditCard,
  Download,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import * as XLSX from "xlsx";
import type {
  ContractWithFinancials,
  Product,
  ProductRateHistory,
  RefundWithContract,
} from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/pagination";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomCalendar } from "@/components/custom-calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getKoreanDateKey, getKoreanEndOfDay, getKoreanStartOfYear } from "@/lib/korean-time";
import { useSettings } from "@/lib/settings";
import { formatCeilAmount } from "@/lib/utils";

const normalizeText = (value: unknown) => String(value ?? "").trim();
const normalizeSearchText = (value: unknown) => normalizeText(value).toLowerCase();
const toNonNegativeInt = (value: unknown) => Math.max(0, Math.round(Number(value) || 0));
const formatAmount = (amount: number) => formatCeilAmount(amount || 0);

const disbursementStatusOptions = [
  "지급예정",
  "지급대기",
  "지급요청",
  "지급완료",
  "일부지급",
  "지급보류",
] as const;

type ProductItem = {
  id: string;
  productName: string;
  userIdentifier: string;
  days: number;
  addQuantity: number;
  extendQuantity: number;
  quantity: number;
  unitPrice: number;
  baseDays: number;
  worker: string;
  workCost: number;
  vatType: string;
  disbursementStatus: string;
};

type PaymentRow = {
  rowKey: string;
  contractId: string;
  contract: ContractWithFinancials;
  item: ProductItem;
  itemIndex: number;
  totalAmount: number;
  workAmount: number;
  refundAmount: number;
  refundDate: string | null;
};

const getDisplayedNetAmount = (row: PaymentRow) => Math.max(0, row.totalAmount - row.refundAmount);

const canonicalPaymentMethod = (value: string | null | undefined) => {
  const normalized = normalizeText(value).replace(/\s+/g, "");
  if (normalized === "입금확인" || normalized === "입금완료") return "입금확인";
  if (normalized === "환불요청" || normalized === "환불처리" || normalized === "환불등록") return "환불요청";
  if (normalized === "적립" || normalized === "적립금" || normalized === "적립금사용" || normalized === "적립금등록") return "적립금 사용";
  if (normalized === "국민") return "국민";
  if (normalized === "하나") return "하나";
  return normalizeText(value);
};

const getPaymentMethodBadgeClassName = (value: string | null | undefined) => {
  const normalized = canonicalPaymentMethod(value);
  if (normalized === "환불요청") return "text-red-600 border-red-200 bg-red-50";
  if (normalized === "적립금 사용") return "text-green-600 border-green-200 bg-green-50";
  if (normalized === "입금확인") return "text-blue-600 border-blue-200 bg-blue-50";
  return "text-foreground border-border bg-muted";
};

const splitStoredListValue = (value: string | null | undefined) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim());

const normalizeVatType = (vat: string | null | undefined) => {
  const normalized = String(vat || "").replace(/\s+/g, "");
  if (!normalized) return "미포함";
  if (["부가세별도", "별도", "미포함", "면세"].includes(normalized)) return "미포함";
  if (["부가세포함", "포함"].includes(normalized)) return "포함";
  return "미포함";
};

const parseInvoiceIssued = (value: string | null | undefined): boolean | null => {
  const normalized = normalizeText(value).replace(/\s+/g, "").toLowerCase();
  if (!normalized) return null;
  const includeValues = ["true", "1", "y", "yes", "o", "발행", "발급", "포함", "부가세포함"];
  const excludeValues = ["false", "0", "n", "no", "x", "미발행", "미발급", "미포함", "별도", "부가세별도", "면세"];
  if (includeValues.includes(normalized)) return true;
  if (excludeValues.includes(normalized)) return false;
  return null;
};

const inferBaseAmountFromTotalWithVat = (totalAmount: number) => {
  const safeTotalAmount = Math.max(0, Number(totalAmount) || 0);
  if (safeTotalAmount <= 0) return 0;
  return safeTotalAmount / 1.1;
};

const getItemQuantity = (item: ProductItem) =>
  Math.max(1, toNonNegativeInt(item.quantity) || toNonNegativeInt(item.addQuantity) + toNonNegativeInt(item.extendQuantity) || 1);

const calculateSupplyAmount = (item: ProductItem) => Math.max(0, Number(item.unitPrice) || 0) * getItemQuantity(item);
const calculateVat = (item: ProductItem) => (normalizeVatType(item.vatType) === "포함" ? calculateSupplyAmount(item) * 0.1 : 0);
const getItemTotalAmount = (item: ProductItem) => calculateSupplyAmount(item) + calculateVat(item);

const buildProductHistoryMap = (histories: ProductRateHistory[]) => {
  const map = new Map<string, ProductRateHistory[]>();
  for (const history of histories) {
    const key = normalizeText(history.productName);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(history);
  }
  Array.from(map.values()).forEach((list) => {
    list.sort((a, b) => {
      const effectiveDiff = new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime();
      if (effectiveDiff !== 0) return effectiveDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  });
  return map;
};

const buildProductMap = (products: Product[]) => {
  const map = new Map<string, Product>();
  products.forEach((product) => {
    const key = normalizeText(product.name);
    if (key) map.set(key, product);
  });
  return map;
};

const resolveProductSnapshotAtDate = (
  productName: string,
  contractDate: Date | string | null | undefined,
  productMap: Map<string, Product>,
  productHistoryMap: Map<string, ProductRateHistory[]>,
) => {
  const normalizedName = normalizeText(productName);
  if (!normalizedName) return undefined;
  const historyList = productHistoryMap.get(normalizedName) || [];
  if (historyList.length > 0) {
    const contractTime = contractDate ? new Date(contractDate).getTime() : Number.NaN;
    if (!Number.isNaN(contractTime)) {
      const matched = historyList.find((history) => new Date(history.effectiveFrom).getTime() <= contractTime);
      if (matched) return matched;
      return historyList[historyList.length - 1];
    }
    return historyList[0];
  }
  return productMap.get(normalizedName);
};

const isViralCategory = (category: string | null | undefined) => (category ?? "").replace(/\s+/g, "") === "바이럴상품";

const createFallbackItem = (contract: ContractWithFinancials): ProductItem => ({
  id: "1",
  productName: normalizeText(contract.products) || "-",
  userIdentifier: normalizeText(contract.userIdentifier),
  days: Math.max(1, Number(contract.days) || 1),
  addQuantity: toNonNegativeInt(contract.addQuantity),
  extendQuantity: toNonNegativeInt(contract.extendQuantity),
  quantity: Math.max(1, Number(contract.quantity) || toNonNegativeInt(contract.addQuantity) + toNonNegativeInt(contract.extendQuantity) || 1),
  unitPrice: Math.max(0, Number(contract.cost) || 0),
  baseDays: Math.max(1, Number(contract.days) || 1),
  worker: normalizeText(contract.worker),
  workCost: Math.max(0, Number(contract.workCost) || 0),
  vatType: parseInvoiceIssued(contract.invoiceIssued) === true ? "포함" : "미포함",
  disbursementStatus: normalizeText(contract.disbursementStatus),
});

const createContractSummaryItem = (
  contract: ContractWithFinancials,
  items: ProductItem[],
): ProductItem => {
  const safeItems = items.length > 0 ? items : [createFallbackItem(contract)];
  const productNames = Array.from(
    new Set(safeItems.map((item) => normalizeText(item.productName)).filter(Boolean)),
  );
  const userIdentifiers = Array.from(
    new Set(safeItems.map((item) => normalizeText(item.userIdentifier)).filter(Boolean)),
  );
  const workers = Array.from(
    new Set(
      safeItems
        .flatMap((item) => normalizeText(item.worker).split(","))
        .map((worker) => worker.trim())
        .filter(Boolean),
    ),
  );

  return {
    id: contract.id,
    productName: productNames.join(", ") || normalizeText(contract.products) || "-",
    userIdentifier: userIdentifiers.join(", ") || normalizeText(contract.userIdentifier),
    days: Math.max(1, Number(contract.days) || 1),
    addQuantity: toNonNegativeInt(contract.addQuantity),
    extendQuantity: toNonNegativeInt(contract.extendQuantity),
    quantity: Math.max(1, Number(contract.quantity) || 1),
    unitPrice: 0,
    baseDays: Math.max(1, Number(contract.days) || 1),
    worker: workers.join(", ") || normalizeText(contract.worker),
    workCost: Math.max(0, Number(contract.workCost) || 0),
    vatType: parseInvoiceIssued(contract.invoiceIssued) === true ? "포함" : "미포함",
    disbursementStatus:
      deriveContractDisbursementStatus(safeItems) ||
      normalizeText(contract.disbursementStatus),
  };
};

const parseStoredProductItems = (
  contract: ContractWithFinancials,
  products: Product[],
  productRateHistories: ProductRateHistory[],
): ProductItem[] => {
  const productMap = buildProductMap(products);
  const productHistoryMap = buildProductHistoryMap(productRateHistories);
  const rawJson = normalizeText(contract.productDetailsJson);

  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        const hydrated = parsed
          .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
          .map((item, index) => {
            const productName = normalizeText(item.productName);
            if (!productName) return null;
            const product = productMap.get(productName);
            const snapshot = resolveProductSnapshotAtDate(productName, contract.contractDate, productMap, productHistoryMap);
            const viralProduct = isViralCategory(product?.category);
            const baseDays = viralProduct
              ? 1
              : Math.max(1, Number(item.baseDays) || 0, Number(snapshot?.baseDays ?? product?.baseDays) || 0, 1);
            const addQuantity = toNonNegativeInt(item.addQuantity);
            const extendQuantity = toNonNegativeInt(item.extendQuantity);
            return {
              id: normalizeText(item.id) || String(index + 1),
              productName,
              userIdentifier: normalizeText(item.userIdentifier),
              days: viralProduct ? 1 : Math.max(1, Number(item.days) || baseDays || 1),
              addQuantity,
              extendQuantity,
              quantity: Math.max(1, Number(item.quantity) || addQuantity + extendQuantity || 1),
              unitPrice: Math.max(0, Number(item.unitPrice) || 0),
              baseDays,
              worker: normalizeText(item.worker ?? snapshot?.worker ?? product?.worker),
              workCost: Math.max(0, Number(item.workCost) || Number(snapshot?.workCost ?? product?.workCost) || 0),
              vatType: normalizeVatType(String(item.vatType ?? snapshot?.vatType ?? product?.vatType ?? "")),
              disbursementStatus: normalizeText(item.disbursementStatus ?? contract.disbursementStatus),
            } satisfies ProductItem;
          })
          .filter((item): item is ProductItem => !!item);

        if (hydrated.length > 0) {
          return hydrated;
        }
      }
    } catch {}
  }

  const productNames = splitStoredListValue(contract.products).filter(Boolean);
  const userIdentifiers = splitStoredListValue(contract.userIdentifier);
  const workerNames = splitStoredListValue(contract.worker);

  if (productNames.length === 0) {
    return [createFallbackItem(contract)];
  }

  const invoiceIssuedFlag = parseInvoiceIssued(contract.invoiceIssued);
  const contractVatType = invoiceIssuedFlag === null ? null : invoiceIssuedFlag ? "포함" : "미포함";
  const totalContractCost = Math.max(0, Number(contract.cost) || 0);
  const derivedBaseAmount = invoiceIssuedFlag === true ? inferBaseAmountFromTotalWithVat(totalContractCost) : totalContractCost;

  const baseItems = productNames.map((name, index) => {
    const product = productMap.get(name);
    const snapshot = resolveProductSnapshotAtDate(name, contract.contractDate, productMap, productHistoryMap);
    const viralProduct = isViralCategory(product?.category);
    const addQuantity = productNames.length === 1 ? toNonNegativeInt(contract.addQuantity) : 0;
    const extendQuantity = productNames.length === 1 ? toNonNegativeInt(contract.extendQuantity) : 0;
    const quantity = productNames.length === 1
      ? Math.max(1, Number(contract.quantity) || addQuantity + extendQuantity || 1)
      : 1;
    const baseDays = viralProduct
      ? 1
      : Math.max(1, Number(snapshot?.baseDays ?? product?.baseDays) || Number(contract.days) || 1, 1);
    return {
      id: String(index + 1),
      productName: name,
      userIdentifier: userIdentifiers[index] || (productNames.length === 1 ? normalizeText(contract.userIdentifier) : ""),
      days: productNames.length === 1 ? Math.max(1, Number(contract.days) || baseDays || 1) : baseDays,
      addQuantity,
      extendQuantity,
      quantity,
      unitPrice: Math.max(0, Number(snapshot?.unitPrice ?? product?.unitPrice) || 0),
      baseDays,
      worker: workerNames[index] || normalizeText(snapshot?.worker ?? product?.worker),
      workCost: Math.max(0, Number(snapshot?.workCost ?? product?.workCost) || 0),
      vatType: contractVatType ?? normalizeVatType(String(snapshot?.vatType ?? product?.vatType ?? "")),
      disbursementStatus: normalizeText(contract.disbursementStatus),
    } satisfies ProductItem;
  });

  if (baseItems.length === 1) {
    const item = baseItems[0];
    if (item.unitPrice <= 0 && derivedBaseAmount > 0) {
      item.unitPrice = derivedBaseAmount;
    }
    if (!item.worker) {
      item.worker = normalizeText(contract.worker);
    }
    if (item.workCost <= 0 && Number(contract.workCost) > 0) {
      item.workCost = Number(contract.workCost);
    }
    return baseItems;
  }

  const estimatedSupply = baseItems.reduce((sum, item) => sum + calculateSupplyAmount(item), 0);
  if (derivedBaseAmount > 0 && estimatedSupply > 0) {
    const ratio = derivedBaseAmount / estimatedSupply;
    baseItems.forEach((item, index) => {
      item.unitPrice = Math.max(0, item.unitPrice * ratio);
      if (index === baseItems.length - 1) {
        const currentSum = baseItems.slice(0, -1).reduce((sum, current) => sum + calculateSupplyAmount(current), 0);
        const currentQuantity = getItemQuantity(item);
        if (currentQuantity > 0) {
          item.unitPrice = Math.max(0, (derivedBaseAmount - currentSum) / currentQuantity);
        }
      }
    });
  }

  return baseItems;
};

const calculateItemWorkCost = (item: ProductItem, contract: ContractWithFinancials) => {
  const workerUnitCost = Math.max(0, Number(item.workCost) || 0);
  if (workerUnitCost <= 0) return 0;
  const workerBaseDays = Math.max(1, Number(item.baseDays) || 1);
  const days = Math.max(1, Number(item.days) || Number(contract.days) || 1);
  return (workerUnitCost / workerBaseDays) * getItemQuantity(item) * days;
};

const normalizeProductItemsForStorage = (items: ProductItem[]) =>
  items
    .filter((item) => normalizeText(item.productName))
    .map((item) => ({
      id: item.id,
      productName: normalizeText(item.productName),
      userIdentifier: normalizeText(item.userIdentifier),
      vatType: normalizeVatType(item.vatType),
      unitPrice: Math.max(0, Number(item.unitPrice) || 0),
      days: Math.max(1, Number(item.days) || 1),
      addQuantity: toNonNegativeInt(item.addQuantity),
      extendQuantity: toNonNegativeInt(item.extendQuantity),
      quantity: getItemQuantity(item),
      baseDays: Math.max(1, Number(item.baseDays) || 1),
      worker: normalizeText(item.worker),
      workCost: Math.max(0, Number(item.workCost) || 0),
      disbursementStatus: normalizeText(item.disbursementStatus),
    }));

const deriveContractDisbursementStatus = (items: ProductItem[]) => {
  const uniqueStatuses = Array.from(new Set(items.map((item) => normalizeText(item.disbursementStatus)).filter(Boolean)));
  if (uniqueStatuses.length === 1) return uniqueStatuses[0];
  return null;
};

export default function PaymentsContentPage() {
  const { formatDate } = useSettings();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [startDate, setStartDate] = useState<Date>(getKoreanStartOfYear());
  const [endDate, setEndDate] = useState<Date>(getKoreanEndOfDay());
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [workerFilter, setWorkerFilter] = useState("all");
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());
  const [bulkDisbursementStatus, setBulkDisbursementStatus] = useState("");

  const { data: contractsData = [], isLoading } = useQuery<ContractWithFinancials[]>({
    queryKey: ["/api/contracts-with-financials"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: productRateHistories = [] } = useQuery<ProductRateHistory[]>({
    queryKey: ["/api/product-rate-histories"],
  });

  const { data: refunds = [] } = useQuery<RefundWithContract[]>({
    queryKey: ["/api/refunds"],
  });

  const bulkExecutionPaymentMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => apiRequest("PUT", `/api/contracts/${id}`, { executionPaymentStatus: "입금완료" })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts-with-financials"] });
      setSelectedRowKeys(new Set());
      toast({ title: "실행비를 입금완료 처리했습니다." });
    },
    onError: () => {
      toast({ title: "실행비 일괄처리에 실패했습니다.", variant: "destructive" });
    },
  });

  const buildDisbursementPayload = (
    contractId: string,
    updatedStatuses: Array<{ rowKey: string; status: string }>,
  ) => {
    const contract = contractsData.find((item) => item.id === contractId);
    if (!contract) {
      return null;
    }

    const nextStatus = normalizeText(updatedStatuses[0]?.status);
    const parsedItems = parseStoredProductItems(contract, products, productRateHistories);
    const baseItems = parsedItems.length > 0 ? parsedItems : [createFallbackItem(contract)];
    const nextItems = baseItems.map((item) => ({
      ...item,
      disbursementStatus: nextStatus,
    }));
    const storedItems = normalizeProductItemsForStorage(nextItems);
    return {
      productDetailsJson: storedItems.length > 0 ? JSON.stringify(storedItems) : null,
      disbursementStatus: nextStatus || null,
    };
  };

  const updateRowDisbursementMutation = useMutation({
    mutationFn: async ({ contractId, rowKey, status }: { contractId: string; rowKey: string; status: string }) => {
      const payload = buildDisbursementPayload(contractId, [{ rowKey, status }]);
      if (!payload) return;
      await apiRequest("PUT", `/api/contracts/${contractId}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts-with-financials"] });
    },
    onError: () => {
      toast({ title: "행 지급현황 변경에 실패했습니다.", variant: "destructive" });
    },
  });

  const bulkRowDisbursementMutation = useMutation({
    mutationFn: async ({ rows, status }: { rows: PaymentRow[]; status: string }) => {
      const grouped = new Map<string, Array<{ rowKey: string; status: string }>>();
      rows.forEach((row) => {
        if (!grouped.has(row.contractId)) grouped.set(row.contractId, []);
        grouped.get(row.contractId)!.push({ rowKey: row.rowKey, status });
      });
      await Promise.all(
        Array.from(grouped.entries()).map(async ([contractId, updates]) => {
          const payload = buildDisbursementPayload(contractId, updates);
          if (!payload) return;
          await apiRequest("PUT", `/api/contracts/${contractId}`, payload);
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts-with-financials"] });
      setSelectedRowKeys(new Set());
      setBulkDisbursementStatus("");
      toast({ title: "선택 행의 지급현황을 적용했습니다." });
    },
    onError: () => {
      toast({ title: "선택 행 지급현황 적용에 실패했습니다.", variant: "destructive" });
    },
  });

  const paymentRows = useMemo(() => {
    const refundRowsByContract = new Map<string, { total: number; lastDate: string | null }>();

    refunds.forEach((refund) => {
      const dateValue = refund.refundDate ? new Date(refund.refundDate).toISOString() : null;
      const current = refundRowsByContract.get(refund.contractId) || { total: 0, lastDate: null };
      current.total += Number(refund.amount) || 0;
      if (!current.lastDate || (dateValue && dateValue > current.lastDate)) current.lastDate = dateValue;
      refundRowsByContract.set(refund.contractId, current);
    });

    return contractsData.map((contract) => {
      const items = parseStoredProductItems(contract, products, productRateHistories);
      const summaryItem = createContractSummaryItem(contract, items);
      const contractRefund = refundRowsByContract.get(contract.id);

      return {
        rowKey: contract.id,
        contractId: contract.id,
        contract,
        item: summaryItem,
        itemIndex: 0,
        totalAmount: Math.max(0, Number(contract.cost) || 0),
        workAmount: Math.max(0, Number(contract.workCost) || 0),
        refundAmount: contractRefund?.total || 0,
        refundDate: contractRefund?.lastDate || null,
      } satisfies PaymentRow;
    });
  }, [contractsData, products, productRateHistories, refunds]);

  const uniqueWorkers = useMemo(() => {
    return Array.from(
      new Set(
        paymentRows
          .flatMap((row) => normalizeText(row.item.worker).split(","))
          .map((worker) => worker.trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, "ko"));
  }, [paymentRows]);

  const filteredRows = useMemo(() => {
    const query = normalizeSearchText(deferredSearchQuery);
    const normalizedWorkerFilter = normalizeSearchText(workerFilter);
    const startKey = getKoreanDateKey(startDate);
    const endKey = getKoreanDateKey(endDate);
    const rangeStart = startKey <= endKey ? startKey : endKey;
    const rangeEnd = startKey <= endKey ? endKey : startKey;

    return paymentRows.filter((row) => {
      const dateKey = getKoreanDateKey(row.contract.contractDate);
      if (dateKey < rangeStart || dateKey > rangeEnd) return false;
      if (paymentFilter === "confirmed" && row.contract.paymentConfirmed !== true) return false;
      if (paymentFilter === "pending" && row.contract.paymentConfirmed === true) return false;

      if (workerFilter !== "all") {
        const workers = normalizeSearchText(row.item.worker).split(",").map((worker) => worker.trim()).filter(Boolean);
        if (!workers.some((worker) => worker === normalizedWorkerFilter)) return false;
      }

      if (!query) return true;

      const haystack = [
        row.contract.customerName,
        row.item.userIdentifier,
        row.item.productName,
        row.contract.managerName,
        row.item.worker,
        row.contract.notes,
      ].map(normalizeSearchText);

      return haystack.some((value) => value.includes(query));
    });
  }, [paymentFilter, paymentRows, deferredSearchQuery, startDate, endDate, workerFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / itemsPerPage));
  const paginatedRows = filteredRows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const currentPageRowKeys = paginatedRows.map((row) => row.rowKey);
  const isCurrentPageAllSelected = currentPageRowKeys.length > 0 && currentPageRowKeys.every((key) => selectedRowKeys.has(key));
  const selectedRows = filteredRows.filter((row) => selectedRowKeys.has(row.rowKey));
  const selectedContractIds = Array.from(new Set(selectedRows.map((row) => row.contractId)));

  useEffect(() => {
    setSelectedRowKeys((prev) => {
      const visibleKeys = new Set(filteredRows.map((row) => row.rowKey));
      const next = new Set(Array.from(prev).filter((key) => visibleKeys.has(key)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredRows]);

  const toggleSelect = (rowKey: string) => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (isCurrentPageAllSelected) {
        currentPageRowKeys.forEach((key) => next.delete(key));
      } else {
        currentPageRowKeys.forEach((key) => next.add(key));
      }
      return next;
    });
  };

  const handleExcelDownload = () => {
    if (selectedRows.length === 0) {
      toast({ title: "엑셀로 내보낼 항목을 먼저 선택해주세요.", variant: "destructive" });
      return;
    }

    const exportRows = selectedRows.map((row) => ({
      날짜: formatDate(row.contract.contractDate),
      고객명: row.contract.customerName || "-",
      사용자ID: row.item.userIdentifier || "-",
      상품: row.item.productName || "-",
      일수: Number(row.item.days) || 0,
      추가: Number(row.item.addQuantity) || 0,
      연장: Number(row.item.extendQuantity) || 0,
      비용: Number(row.totalAmount) || 0,
      담당자: row.contract.managerName || "-",
      결제확인: canonicalPaymentMethod(row.contract.paymentMethod) || "-",
      환불금액: Number(row.refundAmount) || 0,
      환불일자: row.refundDate ? formatDate(row.refundDate) : "-",
      작업비: Number(row.workAmount) || 0,
      작업자: row.item.worker || "-",
      실행비결제: row.contract.executionPaymentStatus || "입금전",
      지급현황: row.item.disbursementStatus || "-",
      비고: row.contract.notes || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet["!cols"] = [
      { wch: 12 },
      { wch: 20 },
      { wch: 18 },
      { wch: 24 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 14 },
      { wch: 12 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 28 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "매출관리");
    XLSX.writeFile(workbook, `매출관리_선택목록_${format(new Date(), "yyyyMMdd_HHmmss")}.xlsx`);
    toast({ title: `${selectedRows.length}건을 엑셀로 내보냈습니다.` });
  };

  const totalCost = filteredRows.reduce((sum, row) => sum + row.totalAmount, 0);
  const totalRefunds = filteredRows.reduce((sum, row) => sum + row.refundAmount, 0);
  const totalWorkCost = filteredRows.reduce((sum, row) => sum + row.workAmount, 0);
  const netAmount = totalCost - totalRefunds - totalWorkCost;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <CreditCard className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">매출관리</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground">검색 결과 {filteredRows.length}건</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="고객명, 사용자ID, 담당자, 상품, 작업자 검색"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9 w-64 rounded-none"
              data-testid="input-search"
            />
          </div>
          <Button
            variant="outline"
            className="gap-2 rounded-none"
            onClick={handleExcelDownload}
            disabled={selectedRows.length === 0}
            data-testid="button-excel-download"
          >
            <Download className="w-4 h-4" />
            엑셀다운로드 ({selectedRows.length})
          </Button>
          <Select value={bulkDisbursementStatus || undefined} onValueChange={setBulkDisbursementStatus}>
            <SelectTrigger className="w-36 rounded-none" data-testid="select-bulk-disbursement-status">
              <SelectValue placeholder="지급현황 선택" />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              {disbursementStatusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="rounded-none"
            disabled={selectedRows.length === 0 || !bulkDisbursementStatus || bulkRowDisbursementMutation.isPending}
            onClick={() => bulkRowDisbursementMutation.mutate({ rows: selectedRows, status: bulkDisbursementStatus })}
            data-testid="button-bulk-disbursement-apply"
          >
            {bulkRowDisbursementMutation.isPending ? "적용 중..." : `지급현황 적용 (${selectedRows.length})`}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card className="rounded-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">총 계약금액</p>
                <p className="text-xl font-bold mt-1" data-testid="text-total-cost">{formatAmount(totalCost)}원</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">총 환불</p>
                <p className="text-xl font-bold mt-1 text-red-500" data-testid="text-total-refund">-{formatAmount(totalRefunds)}원</p>
              </div>
              <TrendingDown className="w-8 h-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">총 작업비</p>
                <p className="text-xl font-bold mt-1 text-blue-500" data-testid="text-total-work-cost">{formatAmount(totalWorkCost)}원</p>
              </div>
              <Coins className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">순매출</p>
                <p className="text-xl font-bold mt-1" data-testid="text-net-amount">{formatAmount(netAmount)}원</p>
              </div>
              <CreditCard className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 p-3 bg-card border border-border rounded-none flex-wrap">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-56 justify-start gap-2 rounded-none" data-testid="filter-date">
              <CalendarIcon className="w-4 h-4" />
              {format(startDate, "yyyy.MM.dd", { locale: ko })} ~ {format(endDate, "yyyy.MM.dd", { locale: ko })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 rounded-none bg-white" align="start">
            <CustomCalendar
              startDate={startDate}
              endDate={endDate}
              onSelectStart={setStartDate}
              onSelectEnd={setEndDate}
            />
          </PopoverContent>
        </Popover>
        <Select
          value={paymentFilter}
          onValueChange={(value) => {
            setPaymentFilter(value);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-32 rounded-none" data-testid="filter-payment">
            <SelectValue placeholder="결제확인" />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="confirmed">확인됨</SelectItem>
            <SelectItem value="pending">대기중</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={workerFilter}
          onValueChange={(value) => {
            setWorkerFilter(value);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-40 rounded-none" data-testid="filter-worker">
            <SelectValue placeholder="작업자" />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="all">전체 작업자</SelectItem>
            {uniqueWorkers.map((worker) => (
              <SelectItem key={worker} value={worker}>
                {worker}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-muted-foreground rounded-none"
          onClick={() => {
            setSearchQuery("");
            setStartDate(getKoreanStartOfYear());
            setEndDate(getKoreanEndOfDay());
            setPaymentFilter("all");
            setWorkerFilter("all");
            setSelectedRowKeys(new Set());
            setCurrentPage(1);
          }}
          data-testid="button-reset-filters"
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          초기화
        </Button>
      </div>

      {selectedRows.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground">{selectedRows.length}건 선택됨</span>
          <Button
            size="sm"
            className="rounded-none"
            onClick={() => bulkExecutionPaymentMutation.mutate(selectedContractIds)}
            disabled={bulkExecutionPaymentMutation.isPending}
            data-testid="button-bulk-execution-payment"
          >
            <CheckCircle className="w-4 h-4 mr-1" />
            {bulkExecutionPaymentMutation.isPending ? "처리 중..." : "입금완료"}
          </Button>
        </div>
      )}

      <Card className="rounded-none">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={isCurrentPageAllSelected}
                      onCheckedChange={toggleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">날짜</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">고객명</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">사용자ID</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">상품</TableHead>
                  <TableHead className="text-xs font-medium text-center whitespace-nowrap">일수</TableHead>
                  <TableHead className="text-xs font-medium text-center whitespace-nowrap">추가</TableHead>
                  <TableHead className="text-xs font-medium text-center whitespace-nowrap">연장</TableHead>
                  <TableHead className="text-xs font-medium text-right whitespace-nowrap">비용</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">담당자</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">결제확인</TableHead>
                  <TableHead className="text-xs font-medium text-right whitespace-nowrap">환불금액</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">환불일자</TableHead>
                  <TableHead className="text-xs font-medium text-right whitespace-nowrap">작업비</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">작업자</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">실행비결제</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">지급현황</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">비고</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 18 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : paginatedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={18} className="p-12 text-center text-muted-foreground">
                      등록된 데이터가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedRows.map((row) => (
                    <TableRow
                      key={row.rowKey}
                      className="hover:bg-muted/20"
                      data-testid={`row-contract-${row.contract.id}-${row.itemIndex}`}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedRowKeys.has(row.rowKey)}
                          onCheckedChange={() => toggleSelect(row.rowKey)}
                          data-testid={`checkbox-contract-${row.contract.id}-${row.itemIndex}`}
                        />
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{formatDate(row.contract.contractDate)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{row.contract.customerName}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{row.item.userIdentifier || "-"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap max-w-[180px] break-all">{row.item.productName || "-"}</TableCell>
                      <TableCell className="text-xs text-center whitespace-nowrap">{row.item.days || 0}</TableCell>
                      <TableCell className="text-xs text-center whitespace-nowrap">{row.item.addQuantity || 0}</TableCell>
                      <TableCell className="text-xs text-center whitespace-nowrap">{row.item.extendQuantity || 0}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap font-medium text-right">
                        <div className="flex flex-col items-end leading-tight">
                          <span>{formatAmount(getDisplayedNetAmount(row))}원</span>
                          {row.refundAmount > 0 && (
                            <span className="text-red-500 font-bold" style={{ fontSize: "0.9em" }}>
                              -{formatAmount(row.refundAmount)}원
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{row.contract.managerName || "-"}</TableCell>
                      <TableCell>
                        {row.contract.paymentMethod ? (
                          <Badge variant="outline" className={`rounded-none text-xs ${getPaymentMethodBadgeClassName(row.contract.paymentMethod)}`}>
                            {canonicalPaymentMethod(row.contract.paymentMethod)}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className={`text-xs whitespace-nowrap font-medium text-right ${row.refundAmount > 0 ? "text-red-500" : ""}`}>
                        {row.refundAmount > 0 ? `-${formatAmount(row.refundAmount)}원` : "-"}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{row.refundDate ? formatDate(row.refundDate) : "-"}</TableCell>
                      <TableCell className={`text-xs whitespace-nowrap font-medium text-right ${row.workAmount > 0 ? "text-blue-500" : ""}`}>
                        {row.workAmount > 0 ? `${formatAmount(row.workAmount)}원` : "-"}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{row.item.worker || "-"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        <Badge variant={row.contract.executionPaymentStatus === "입금완료" ? "default" : "secondary"} className="rounded-none text-xs">
                          {row.contract.executionPaymentStatus || "입금전"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        <Select
                          value={row.item.disbursementStatus || undefined}
                          onValueChange={(value) => updateRowDisbursementMutation.mutate({ contractId: row.contract.id, rowKey: row.rowKey, status: value })}
                        >
                          <SelectTrigger className="h-7 text-xs rounded-none w-[100px] px-2" data-testid={`select-disbursement-${row.contract.id}-${row.itemIndex}`}>
                            <SelectValue placeholder="선택" />
                          </SelectTrigger>
                          <SelectContent className="rounded-none">
                            {disbursementStatusOptions.map((status) => (
                              <SelectItem key={status} value={status}>
                                {status}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground w-[180px] max-w-[180px]">
                        <span
                          className="block max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap"
                          title={row.contract.notes || "-"}
                        >
                          {row.contract.notes || "-"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <Select
          value={itemsPerPage.toString()}
          onValueChange={(value) => {
            setItemsPerPage(Number(value));
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-32 rounded-none" data-testid="select-items-per-page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="10">10개씩 보기</SelectItem>
            <SelectItem value="20">20개씩 보기</SelectItem>
            <SelectItem value="50">50개씩 보기</SelectItem>
          </SelectContent>
        </Select>

        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>
    </div>
  );
}
