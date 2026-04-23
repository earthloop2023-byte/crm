import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { CustomCalendar } from "@/components/custom-calendar";
import { AlertCircle, Search, Download, Filter, Calendar as CalendarIcon, RefreshCw } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import type { Contract, Product, ProductRateHistory } from "@shared/schema";
import { getKoreanStartOfYear, getKoreanEndOfDay, getKoreanDateKey } from "@/lib/korean-time";
import { useSettings } from "@/lib/settings";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { matchesKoreanSearch } from "@shared/korean-search";

type ProductItem = {
  id: string;
  productName: string;
  userIdentifier: string;
  vatType: string;
  unitPrice: number;
  days: number;
  addQuantity: number;
  extendQuantity: number;
  quantity: number;
  baseDays: number;
  worker: string;
  workCost: number;
};

type ReceivableRow = {
  rowKey: string;
  contract: Contract;
  item: ProductItem;
  itemIndex: number;
  receivableAmount: number;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();
const toNonNegativeInt = (value: unknown) => Math.max(0, Math.round(Number(value) || 0));
const formatAmount = (amount: number) => new Intl.NumberFormat("ko-KR").format(Math.round(amount || 0));

const receivableBankMethods = new Set(["하나", "국민"]);
const excludedPaymentMethods = new Set(["적립", "적립금", "적립금사용"]);

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
  const safeTotalAmount = Math.max(0, Math.round(Number(totalAmount) || 0));
  if (safeTotalAmount <= 0) return 0;
  const approx = Math.round(safeTotalAmount / 1.1);
  for (let delta = -20; delta <= 20; delta += 1) {
    const candidate = approx + delta;
    if (candidate < 0) continue;
    if (candidate + Math.round(candidate * 0.1) === safeTotalAmount) {
      return candidate;
    }
  }
  return approx;
};

const getItemQuantity = (item: ProductItem) =>
  Math.max(1, toNonNegativeInt(item.quantity) || toNonNegativeInt(item.addQuantity) + toNonNegativeInt(item.extendQuantity) || 1);

const calculateSupplyAmount = (item: ProductItem) => Math.max(0, Number(item.unitPrice) || 0) * getItemQuantity(item);
const calculateVat = (item: ProductItem) => (normalizeVatType(item.vatType) === "포함" ? Math.round(calculateSupplyAmount(item) * 0.1) : 0);
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

const createFallbackItem = (contract: Contract): ProductItem => ({
  id: "1",
  productName: normalizeText(contract.products) || "-",
  userIdentifier: normalizeText(contract.userIdentifier),
  vatType: parseInvoiceIssued(contract.invoiceIssued) === true ? "포함" : "미포함",
  unitPrice: Math.max(0, Number(contract.cost) || 0),
  days: Math.max(1, Number(contract.days) || 1),
  addQuantity: toNonNegativeInt(contract.addQuantity),
  extendQuantity: toNonNegativeInt(contract.extendQuantity),
  quantity: Math.max(1, Number(contract.quantity) || toNonNegativeInt(contract.addQuantity) + toNonNegativeInt(contract.extendQuantity) || 1),
  baseDays: Math.max(1, Number(contract.days) || 1),
  worker: normalizeText(contract.worker),
  workCost: Math.max(0, Number(contract.workCost) || 0),
});

const parseStoredProductItems = (
  contract: Contract,
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
              vatType: normalizeVatType(String(item.vatType ?? snapshot?.vatType ?? product?.vatType ?? "")),
              unitPrice: Math.max(0, Number(item.unitPrice) || 0),
              days: viralProduct ? 1 : Math.max(1, Number(item.days) || baseDays || 1),
              addQuantity,
              extendQuantity,
              quantity: Math.max(1, Number(item.quantity) || addQuantity + extendQuantity || 1),
              baseDays,
              worker: normalizeText(item.worker ?? snapshot?.worker ?? product?.worker),
              workCost: Math.max(0, Number(item.workCost) || Number(snapshot?.workCost ?? product?.workCost) || 0),
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
      vatType: contractVatType ?? normalizeVatType(String(snapshot?.vatType ?? product?.vatType ?? "")),
      unitPrice: Math.max(0, Number(snapshot?.unitPrice ?? product?.unitPrice) || 0),
      days: productNames.length === 1 ? Math.max(1, Number(contract.days) || baseDays || 1) : baseDays,
      addQuantity,
      extendQuantity,
      quantity,
      baseDays,
      worker: workerNames[index] || normalizeText(snapshot?.worker ?? product?.worker),
      workCost: Math.max(0, Number(snapshot?.workCost ?? product?.workCost) || 0),
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
      item.unitPrice = Math.max(0, Math.round(item.unitPrice * ratio));
      if (index === baseItems.length - 1) {
        const currentSum = baseItems.slice(0, -1).reduce((sum, current) => sum + calculateSupplyAmount(current), 0);
        const currentQuantity = getItemQuantity(item);
        if (currentQuantity > 0) {
          item.unitPrice = Math.max(0, Math.round((derivedBaseAmount - currentSum) / currentQuantity));
        }
      }
    });
  }

  return baseItems;
};

export default function ReceivablesPage() {
  const { toast } = useToast();
  const { formatDate } = useSettings();
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [startDate, setStartDate] = useState<Date>(getKoreanStartOfYear());
  const [endDate, setEndDate] = useState<Date>(getKoreanEndOfDay());
  const [customerFilter, setCustomerFilter] = useState("all");
  const [managerFilter, setManagerFilter] = useState("all");
  const [selectedReceivableRowKeys, setSelectedReceivableRowKeys] = useState<Set<string>>(new Set());

  const { data: allContracts = [], isLoading } = useQuery<Contract[]>({
    queryKey: ["/api/contracts"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: productRateHistories = [] } = useQuery<ProductRateHistory[]>({
    queryKey: ["/api/product-rate-histories"],
  });

  const isReceivableContract = (contract: Contract) => {
    const paymentMethod = normalizeText(contract.paymentMethod);
    if (excludedPaymentMethods.has(paymentMethod)) return false;
    if (receivableBankMethods.has(paymentMethod)) return true;
    return !contract.paymentConfirmed;
  };

  const receivableRows = useMemo(() => {
    return allContracts
      .filter((contract) => isReceivableContract(contract))
      .flatMap((contract) => {
        const items = parseStoredProductItems(contract, products, productRateHistories);
        const safeItems = items.length > 0 ? items : [createFallbackItem(contract)];
        return safeItems.map((item, itemIndex) => {
          const computedAmount = getItemTotalAmount(item);
          const receivableAmount = computedAmount > 0
            ? computedAmount
            : safeItems.length === 1
              ? Math.max(0, Number(contract.cost) || 0)
              : 0;

          return {
            rowKey: `${contract.id}:${item.id || itemIndex + 1}`,
            contract,
            item,
            itemIndex,
            receivableAmount,
          } satisfies ReceivableRow;
        });
      });
  }, [allContracts, products, productRateHistories]);

  const receivables = useMemo(() => {
    const query = normalizeText(deferredSearchQuery);
    const startKey = getKoreanDateKey(startDate);
    const endKey = getKoreanDateKey(endDate);
    const rangeStart = startKey <= endKey ? startKey : endKey;
    const rangeEnd = startKey <= endKey ? endKey : startKey;

    return receivableRows.filter((row) => {
      const dateKey = getKoreanDateKey(row.contract.contractDate);
      if (dateKey < rangeStart || dateKey > rangeEnd) return false;

      if (customerFilter !== "all" && row.contract.customerName !== customerFilter) return false;
      if (managerFilter !== "all" && row.contract.managerName !== managerFilter) return false;

      if (!query) return true;

      return matchesKoreanSearch(
        [
          row.contract.customerName,
          row.item.userIdentifier,
          row.contract.managerName,
          row.item.productName,
          row.item.worker,
          row.contract.notes,
        ],
        query,
      );
    });
  }, [customerFilter, deferredSearchQuery, endDate, managerFilter, receivableRows, startDate]);

  const uniqueCustomers = useMemo(
    () => Array.from(new Set(receivableRows.map((row) => row.contract.customerName).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko")),
    [receivableRows],
  );
  const uniqueManagers = useMemo(
    () => Array.from(new Set(receivableRows.map((row) => row.contract.managerName).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko")),
    [receivableRows],
  );

  const totalPages = Math.max(1, Math.ceil(receivables.length / itemsPerPage));
  const paginatedReceivables = receivables.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const currentPageReceivableKeys = paginatedReceivables.map((row) => row.rowKey);
  const isCurrentPageAllSelected = currentPageReceivableKeys.length > 0 &&
    currentPageReceivableKeys.every((key) => selectedReceivableRowKeys.has(key));
  const selectedReceivables = receivables.filter((row) => selectedReceivableRowKeys.has(row.rowKey));

  const totalReceivableAmount = receivables.reduce((sum, row) => sum + row.receivableAmount, 0);

  useEffect(() => {
    setSelectedReceivableRowKeys((prev) => {
      const visibleKeys = new Set(receivables.map((row) => row.rowKey));
      const next = new Set(Array.from(prev).filter((key) => visibleKeys.has(key)));
      return next.size === prev.size ? prev : next;
    });
  }, [receivables]);

  const resetFilters = () => {
    setSearchQuery("");
    setCustomerFilter("all");
    setManagerFilter("all");
    setStartDate(getKoreanStartOfYear());
    setEndDate(getKoreanEndOfDay());
    setCurrentPage(1);
    setSelectedReceivableRowKeys(new Set());
  };

  const toggleReceivableSelection = (rowKey: string) => {
    setSelectedReceivableRowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  };

  const toggleSelectAllOnCurrentPage = () => {
    setSelectedReceivableRowKeys((prev) => {
      const next = new Set(prev);
      if (isCurrentPageAllSelected) {
        currentPageReceivableKeys.forEach((key) => next.delete(key));
      } else {
        currentPageReceivableKeys.forEach((key) => next.add(key));
      }
      return next;
    });
  };

  const handleExcelDownload = () => {
    if (selectedReceivables.length === 0) {
      toast({ title: "엑셀로 내보낼 항목을 먼저 선택해주세요.", variant: "destructive" });
      return;
    }

    const selectedTotalReceivableAmount = selectedReceivables.reduce((sum, row) => sum + row.receivableAmount, 0);
    const exportRows = [
      ...selectedReceivables.map((row) => ({
        날짜: formatDate(row.contract.contractDate),
        고객명: row.contract.customerName,
        사용자ID: row.item.userIdentifier || "-",
        상품: row.item.productName || "-",
        일수: Number(row.item.days) || 0,
        추가: Number(row.item.addQuantity) || 0,
        연장: Number(row.item.extendQuantity) || 0,
        비용: Number(row.receivableAmount) || 0,
        담당자: row.contract.managerName || "-",
        미수금액: Number(row.receivableAmount) || 0,
        작업자: row.item.worker || "-",
        비고: row.contract.notes || "",
      })),
      {
        날짜: "합계",
        고객명: "",
        사용자ID: "",
        상품: "",
        일수: "",
        추가: "",
        연장: "",
        비용: selectedTotalReceivableAmount,
        담당자: "",
        미수금액: selectedTotalReceivableAmount,
        작업자: "",
        비고: "",
      },
    ];

    void exportRows;

    const exportRowsForExcel = [
      ["날짜", "고객명", "사용자ID", "상품", "일수", "추가", "연장", "비용", "담당자"],
      ...selectedReceivables.map((row) => [
        formatDate(row.contract.contractDate),
        row.contract.customerName,
        row.item.userIdentifier || "-",
        row.item.productName || "-",
        Number(row.item.days) || 0,
        Number(row.item.addQuantity) || 0,
        Number(row.item.extendQuantity) || 0,
        Number(row.receivableAmount) || 0,
        row.contract.managerName || "-",
      ]),
      ["합계", "", "", "", "", "", "", selectedTotalReceivableAmount, ""],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(exportRowsForExcel);
    worksheet["!cols"] = [
      { wch: 12 },
      { wch: 20 },
      { wch: 18 },
      { wch: 24 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 14 },
      { wch: 14 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "미수금");
    const fileName = `미수금_선택목록_${format(new Date(), "yyyyMMdd_HHmmss")}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast({ title: `${selectedReceivables.length}건을 엑셀로 내보냈습니다.` });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-500" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">미수금 관리</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm" data-testid="text-result-count">
            검색 결과 {receivables.length}건 | 총 미수금{" "}
            <span className="text-red-500 font-bold text-base" data-testid="text-total-receivable">
              {formatAmount(totalReceivableAmount)}원
            </span>
          </span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="고객명, 사용자ID, 상품, 담당자, 작업자 검색"
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
            disabled={selectedReceivables.length === 0}
            data-testid="button-excel-download"
          >
            <Download className="w-4 h-4" />
            엑셀 다운로드 ({selectedReceivables.length})
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 p-3 bg-card border border-border rounded-none flex-wrap">
        <Button variant="ghost" size="sm" className="gap-1 rounded-none">
          <Filter className="w-4 h-4" />
          필터추가
        </Button>
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

        <Select value={customerFilter} onValueChange={(v) => { setCustomerFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-36 rounded-none" data-testid="filter-customer">
            <SelectValue placeholder="고객명" />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="all">전체</SelectItem>
            {uniqueCustomers.map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={managerFilter} onValueChange={(v) => { setManagerFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-36 rounded-none" data-testid="filter-manager">
            <SelectValue placeholder="담당자" />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="all">전체</SelectItem>
            {uniqueManagers.map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground rounded-none" onClick={resetFilters} data-testid="button-reset-filter">
          <RefreshCw className="w-4 h-4 mr-1" />
          초기화
        </Button>
      </div>

      <Card className="rounded-none">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">
                    <Checkbox
                      checked={isCurrentPageAllSelected}
                      onCheckedChange={toggleSelectAllOnCurrentPage}
                      data-testid="checkbox-select-all-receivables"
                    />
                  </th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">날짜</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">고객명</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">사용자ID</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">상품</th>
                  <th className="p-4 text-center font-medium text-xs whitespace-nowrap">일수</th>
                  <th className="p-4 text-center font-medium text-xs whitespace-nowrap">추가</th>
                  <th className="p-4 text-center font-medium text-xs whitespace-nowrap">연장</th>
                  <th className="p-4 text-right font-medium text-xs whitespace-nowrap">비용</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">담당자</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">미수금액</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">작업자</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">비고</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="p-4"><Skeleton className="h-4 w-12" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-24" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-28" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-32" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-12" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-12" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-12" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-24" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-32" /></td>
                    </tr>
                  ))
                ) : paginatedReceivables.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="p-12 text-center text-muted-foreground">미수금 내역이 없습니다.</td>
                  </tr>
                ) : (
                  paginatedReceivables.map((row) => (
                    <tr key={row.rowKey} className="border-b border-border hover:bg-muted/20 transition-colors" data-testid={`row-receivable-${row.contract.id}-${row.itemIndex}`}>
                      <td className="p-4">
                        <Checkbox
                          checked={selectedReceivableRowKeys.has(row.rowKey)}
                          onCheckedChange={() => toggleReceivableSelection(row.rowKey)}
                          data-testid={`checkbox-receivable-${row.contract.id}-${row.itemIndex}`}
                        />
                      </td>
                      <td className="p-4 text-xs whitespace-nowrap">{formatDate(row.contract.contractDate)}</td>
                      <td className="p-4 text-xs whitespace-nowrap">{row.contract.customerName}</td>
                      <td className="p-4 text-xs whitespace-nowrap">{row.item.userIdentifier || "-"}</td>
                      <td className="p-4 text-xs whitespace-nowrap">{row.item.productName || "-"}</td>
                      <td className="p-4 text-xs text-center whitespace-nowrap">{row.item.days || 0}</td>
                      <td className="p-4 text-xs text-center whitespace-nowrap">{row.item.addQuantity || 0}</td>
                      <td className="p-4 text-xs text-center whitespace-nowrap">{row.item.extendQuantity || 0}</td>
                      <td className="p-4 text-xs text-right whitespace-nowrap">{formatAmount(row.receivableAmount)}원</td>
                      <td className="p-4 text-xs whitespace-nowrap">{row.contract.managerName || "-"}</td>
                      <td className="p-4 text-xs whitespace-nowrap font-bold text-red-500">{formatAmount(row.receivableAmount)}원</td>
                      <td className="p-4 text-xs whitespace-nowrap">{row.item.worker || "-"}</td>
                      <td className="p-4 text-xs whitespace-nowrap text-muted-foreground">{row.contract.notes || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {paginatedReceivables.length > 0 && (
                <tfoot>
                  <tr className="bg-muted/30 border-t-2 border-border">
                    <td colSpan={10} className="p-4 text-right font-bold text-xs whitespace-nowrap">합계</td>
                    <td className="p-4 text-xs whitespace-nowrap font-bold text-red-500" data-testid="text-footer-total">{formatAmount(totalReceivableAmount)}원</td>
                    <td className="p-4" />
                    <td className="p-4" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <Select value={itemsPerPage.toString()} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1); }}>
          <SelectTrigger className="w-32 rounded-none" data-testid="select-items-per-page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="10">10개씩 보기</SelectItem>
            <SelectItem value="50">50개씩 보기</SelectItem>
            <SelectItem value="100">100개씩 보기</SelectItem>
            <SelectItem value="500">500개씩 보기</SelectItem>
          </SelectContent>
        </Select>

        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>
    </div>
  );
}
