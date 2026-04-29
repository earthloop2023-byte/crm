import { useState, useMemo, useRef, useEffect, useDeferredValue } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  Plus, 
  Search, 
  Trash2, 
  Copy,
  CalendarIcon,
  RotateCcw,
  ChevronDown,
  GripVertical,
  Undo2
} from "lucide-react";
import { Pagination } from "@/components/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CustomCalendar } from "@/components/custom-calendar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getFinancialAmountWithVat, getFinancialTargetGrossAmount } from "@/lib/contract-financials";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import type { Contract, Deposit, InsertContract, User, Customer, Product, ProductRateHistory, Refund } from "@shared/schema";
import { Textarea } from "@/components/ui/textarea";
import { getKoreanNow, getKoreanStartOfYear, getKoreanEndOfDay, getKoreanDateKey } from "@/lib/korean-time";
import { useSettings } from "@/lib/settings";
import { formatCeilAmount } from "@/lib/utils";
import { matchesKoreanSearch } from "@shared/korean-search";

const DEFAULT_CREATE_PAYMENT_METHOD = "입금 전";
const DEFAULT_CREATE_DEPOSIT_BANK = "하나은행";
const DEFAULT_CREATE_VAT_TYPE = "포함";
const CONTRACT_PAYMENT_METHOD_OPTIONS = ["입금 전", "입금확인", "적립금사용", "환불요청", "기타"] as const;
const CONTRACT_DEPOSIT_BANK_OPTIONS = ["하나은행", "국민은행", "농협은행", "카드 결제", "기타"] as const;

function AutocompleteInput({ 
  value, 
  onChange, 
  options, 
  placeholder, 
  className,
  testId,
  disabled = false,
}: { 
  value: string; 
  onChange: (val: string) => void; 
  options: string[]; 
  placeholder?: string; 
  className?: string;
  testId?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value || "");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  useEffect(() => { setSearch(value || ""); }, [value]);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const updateDropdownPosition = () => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 2,
      left: rect.left,
      width: rect.width,
      zIndex: 10000,
    });
  };

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const inRef = ref.current?.contains(e.target as Node);
      const inDropdown = dropdownRef.current?.contains(e.target as Node);
      if (!inRef && !inDropdown) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    updateDropdownPosition();
    const handleReposition = () => updateDropdownPosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open]);

  const filtered = search
    ? options.filter((option) => matchesKoreanSearch([option], search))
    : options;
  const visibleOptions = filtered.slice(0, 20);
  const isDropdownInteractionRef = useRef(false);

  const selectOption = (item: string) => {
    onChange(item);
    setSearch(item);
    setOpen(false);
    setHighlightedIndex(-1);
    isDropdownInteractionRef.current = false;
  };

  useEffect(() => {
    if (!open || visibleOptions.length === 0) {
      setHighlightedIndex(-1);
      return;
    }
    setHighlightedIndex((prev) => {
      if (prev < 0 || prev >= visibleOptions.length) return 0;
      return prev;
    });
  }, [open, visibleOptions.length]);

  useEffect(() => {
    if (!open || highlightedIndex < 0) return;
    const el = dropdownRef.current?.querySelector<HTMLElement>(`[data-option-index="${highlightedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, highlightedIndex]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const val = e.target.value;
    setSearch(val);
    setOpen(true);
    updateDropdownPosition();
    setHighlightedIndex(0);
    const exactMatch = options.find(o => o === val);
    if (exactMatch) {
      onChange(exactMatch);
    }
  };

  const handleBlur = () => {
    if (isDropdownInteractionRef.current) return;
    setTimeout(() => {
      setOpen(false);
      const exactMatch = options.find(o => o === search);
      if (exactMatch) {
        onChange(exactMatch);
      }
    }, 150);
  };

  const handleFocus = () => {
    if (disabled) return;
    setOpen(true);
    updateDropdownPosition();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      if (visibleOptions.length === 0) return;
      setHighlightedIndex((prev) => (prev < 0 ? 0 : (prev + 1) % visibleOptions.length));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      if (visibleOptions.length === 0) return;
      setHighlightedIndex((prev) => (prev < 0 ? visibleOptions.length - 1 : (prev - 1 + visibleOptions.length) % visibleOptions.length));
      return;
    }

    if (e.key === "Enter" && open && visibleOptions.length > 0) {
      e.preventDefault();
      const targetIndex = highlightedIndex >= 0 ? highlightedIndex : 0;
      selectOption(visibleOptions[targetIndex]);
      return;
    }

    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <div ref={ref} className="relative">
      <Input
        ref={inputRef}
        value={search}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        data-testid={testId}
        disabled={disabled}
      />
      {open && !disabled && filtered.length > 0 && createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          data-allow-dialog-outside-interaction="true"
          className="max-h-48 overflow-y-auto rounded-none border bg-popover text-popover-foreground shadow-lg pointer-events-auto"
        >
          {visibleOptions.map((item, idx) => (
            <div
              key={idx}
              data-allow-dialog-outside-interaction="true"
              className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground ${
                highlightedIndex === idx ? "bg-accent text-accent-foreground" : ""
              }`}
              onPointerDown={(e) => {
                isDropdownInteractionRef.current = true;
                e.preventDefault();
                selectOption(item);
              }}
              onMouseEnter={() => setHighlightedIndex(idx)}
              data-testid={testId ? `${testId}-option-${idx}` : undefined}
              data-option-index={idx}
            >
              {search ? (
                (() => {
                  const lowerItem = item.toLowerCase();
                  const lowerSearch = search.toLowerCase();
                  const matchIdx = lowerItem.indexOf(lowerSearch);
                  if (matchIdx === -1) return item;
                  return (
                    <>
                      {item.slice(0, matchIdx)}
                      <strong className="text-primary">{item.slice(matchIdx, matchIdx + search.length)}</strong>
                      {item.slice(matchIdx + search.length)}
                    </>
                  );
                })()
              ) : item}
            </div>
          ))}
          {filtered.length > visibleOptions.length && (
            <div className="px-3 py-1 text-xs text-muted-foreground">... {filtered.length - visibleOptions.length}개 더</div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

export default function ContractsPage() {
  const { toast } = useToast();
  const { user: loggedInUser } = useAuth();
  const { formatDate } = useSettings();
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isRefundOpen, setIsRefundOpen] = useState(false);
  const [refundContractId, setRefundContractId] = useState<string | null>(null);
  const [refundDate, setRefundDate] = useState<Date>(getKoreanNow());
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [refundQuantity, setRefundQuantity] = useState<number>(0);
  const [refundDays, setRefundDays] = useState<number>(0);
  const [refundTargetItem, setRefundTargetItem] = useState<ProductItem | null>(null);
  const [refundAccount, setRefundAccount] = useState("");
  const [refundSlot, setRefundSlot] = useState("");
  const [refundWorker, setRefundWorker] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [isWorkCostOverrideOpen, setIsWorkCostOverrideOpen] = useState(false);
  const [workCostOverrideContractId, setWorkCostOverrideContractId] = useState<string | null>(null);
  const [workCostOverrideItemId, setWorkCostOverrideItemId] = useState<string | null>(null);
  const [workCostOverrideFormItemId, setWorkCostOverrideFormItemId] = useState<string | null>(null);
  const [overrideWorker, setOverrideWorker] = useState("");
  const [overrideWorkCostAmount, setOverrideWorkCostAmount] = useState<number>(0);
  const [createDialogMode, setCreateDialogMode] = useState<"create" | "copy">("create");
  const [createDialogRenderKey, setCreateDialogRenderKey] = useState(0);
  const [editDialogMode, setEditDialogMode] = useState<"edit" | "view">("edit");
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectedRowMap, setSelectedRowMap] = useState<Record<string, ContractListRow>>({});
  const [keepSelectionAcrossPages, setKeepSelectionAcrossPages] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [productItemNumericDrafts, setProductItemNumericDrafts] = useState<Record<string, string>>({});
  
  // Filter states
  const [managerFilter, setManagerFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [sortOption, setSortOption] = useState<string>("contractDateDesc");
  const [startDate, setStartDate] = useState<Date>(getKoreanStartOfYear());
  const [endDate, setEndDate] = useState<Date>(getKoreanEndOfDay());

  // Product item type for the form
  interface ProductItem {
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
    fixedWorkCostAmount: number | null;
    disbursementStatus: string;
    supplyAmount?: number | null;
    grossSupplyAmount?: number | null;
    refundAmount?: number | null;
    negativeAdjustmentAmount?: number | null;
    marginAmount?: number | null;
  }

  type EditableNumericProductField = "unitPrice" | "days" | "addQuantity" | "extendQuantity";

  type ContractListRow = {
    rowKey: string;
    contract: Contract;
    item: ProductItem;
    itemIndex: number;
  };

  interface PagedContractsResponse {
    items: Contract[];
    total: number;
    page: number;
    pageSize: number;
  }

  const createEmptyProductItem = (id: string): ProductItem => ({
    id,
    productName: "",
    userIdentifier: "",
    vatType: DEFAULT_CREATE_VAT_TYPE,
    unitPrice: 0,
    days: 1,
    addQuantity: 0,
    extendQuantity: 0,
    quantity: 0,
    baseDays: 0,
    worker: "",
    workCost: 0,
    fixedWorkCostAmount: null,
    disbursementStatus: "",
    supplyAmount: null,
    grossSupplyAmount: null,
    refundAmount: null,
    negativeAdjustmentAmount: null,
    marginAmount: null,
  });

  const getDefaultContractFormData = (): Partial<InsertContract> => ({
    contractNumber: "",
    contractDate: getKoreanNow(),
    managerId: loggedInUser?.id || undefined,
    managerName: loggedInUser?.name || "",
    customerId: undefined,
    customerName: "",
    products: "",
    cost: 0,
    paymentConfirmed: false,
    paymentMethod: DEFAULT_CREATE_PAYMENT_METHOD,
    depositBank: DEFAULT_CREATE_DEPOSIT_BANK,
    invoiceIssued: DEFAULT_CREATE_VAT_TYPE,
    worker: "",
    notes: "",
    disbursementStatus: "",
    userIdentifier: "",
  });

  // Form state
  const [formData, setFormData] = useState<Partial<InsertContract>>(getDefaultContractFormData());

  const [productItems, setProductItems] = useState<ProductItem[]>([
    createEmptyProductItem("1"),
  ]);

  const contractsQueryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(currentPage));
    params.set("pageSize", String(pageSize));
    params.set("startDate", format(startDate, "yyyy-MM-dd"));
    params.set("endDate", format(endDate, "yyyy-MM-dd"));

    const normalizedSearch = deferredSearchQuery.trim();
    if (normalizedSearch) params.set("search", normalizedSearch);
    if (managerFilter !== "all") params.set("manager", managerFilter);
    if (customerFilter !== "all") params.set("customer", customerFilter);
    if (productFilter !== "all") params.set("productCategory", productFilter);
    if (paymentFilter !== "all") params.set("payment", paymentFilter);
    if (sortOption) params.set("sort", sortOption);
    return params.toString();
  }, [
    currentPage,
    pageSize,
    startDate,
    endDate,
    deferredSearchQuery,
    managerFilter,
    customerFilter,
    productFilter,
    paymentFilter,
    sortOption,
  ]);

  const { data: contractsPageData, isLoading } = useQuery<PagedContractsResponse>({
    queryKey: ["/api/contracts/paged", contractsQueryString],
    queryFn: async () => {
      const res = await fetch(`/api/contracts/paged?${contractsQueryString}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res.json();
    },
    placeholderData: (previousData) => previousData,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const contracts = contractsPageData?.items ?? [];
  const totalFilteredContracts = Math.max(0, Number(contractsPageData?.total ?? 0));

  const replaceContractInPagedResponse = (
    previousData: PagedContractsResponse | undefined,
    updatedContract: Contract,
  ): PagedContractsResponse | undefined => {
    if (!previousData) return previousData;
    return {
      ...previousData,
      items: previousData.items.map((contract) =>
        contract.id === updatedContract.id ? { ...contract, ...updatedContract } : contract,
      ),
    };
  };

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: deposits = [] } = useQuery<Deposit[]>({
    queryKey: ["/api/deposits"],
  });

  const { data: refunds = [] } = useQuery<Refund[]>({
    queryKey: ["/api/refunds"],
  });

  const { data: productRateHistories = [] } = useQuery<ProductRateHistory[]>({
    queryKey: ["/api/product-rate-histories"],
  });

  const managerFilterOptions = useMemo(() => {
    return Array.from(
      new Set([
        ...users.map((user) => normalizeText(user.name)),
        ...contracts.map((contract) => normalizeText(contract.managerName)),
      ].filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "ko"));
  }, [contracts, users]);

  const customerFilterOptions = useMemo(() => {
    return Array.from(
      new Set(customers.map((customer) => normalizeText(customer.name)).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "ko"));
  }, [customers]);

  const productFilterOptions = useMemo(() => {
    return Array.from(
      new Set(products.map((product) => normalizeCategoryLabel(product.category)).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "ko"));
  }, [products]);

  const linkedDepositByContractId = useMemo(() => {
    const next = new Map<string, Deposit>();
    for (const deposit of deposits) {
      const contractId = String(deposit.contractId || "").trim();
      if (!contractId || next.has(contractId)) continue;
      next.set(contractId, deposit);
    }
    return next;
  }, [deposits]);

  const contractById = useMemo(() => {
    const next = new Map<string, Contract>();
    for (const contract of contracts) {
      const key = String(contract.id || "").trim();
      if (!key) continue;
      next.set(key, contract);
    }
    return next;
  }, [contracts]);

  const getFinancialItemKey = (contractId: string | null | undefined, itemId: string | null | undefined) =>
    `${String(contractId || "").trim()}::${String(itemId || "").trim()}`;

  const normalizeFinancialMatchText = (value: string | null | undefined) =>
    normalizeText(value).replace(/\s+/g, "");

  const getFinancialFallbackKey = (
    contractId: string | null | undefined,
    userIdentifier: string | null | undefined,
    productName: string | null | undefined,
  ) =>
    `${String(contractId || "").trim()}::${normalizeFinancialMatchText(userIdentifier)}::${normalizeFinancialMatchText(productName)}`;

  const refundAmountByItemKey = useMemo(() => {
    const next = new Map<string, number>();
    for (const refund of refunds) {
      const key = getFinancialItemKey(refund.contractId, refund.itemId || "");
      const refundAmount = Math.max(Number(refund.amount) || 0, 0);
      next.set(key, (next.get(key) || 0) + refundAmount);
    }
    return next;
  }, [refunds]);

  const refundAmountByFallbackKey = useMemo(() => {
    const next = new Map<string, number>();
    for (const refund of refunds) {
      const key = getFinancialFallbackKey(refund.contractId, refund.userIdentifier, refund.productName);
      const refundAmount = Math.max(Number(refund.amount) || 0, 0);
      next.set(key, (next.get(key) || 0) + refundAmount);
    }
    return next;
  }, [refunds]);

  const refundAmountByContractId = useMemo(() => {
    const next = new Map<string, number>();
    for (const refund of refunds) {
      const contractId = String(refund.contractId || "").trim();
      if (!contractId) continue;
      const refundAmount = Math.max(Number(refund.amount) || 0, 0);
      next.set(contractId, (next.get(contractId) || 0) + refundAmount);
    }
    return next;
  }, [refunds]);

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearchQuery, managerFilter, customerFilter, productFilter, paymentFilter, sortOption, startDate, endDate]);

  useEffect(() => {
    if (!keepSelectionAcrossPages) {
      setSelectedItems([]);
      setSelectedRowMap({});
    }
  }, [contractsQueryString, keepSelectionAcrossPages]);

  const createMutation = useMutation({
    mutationFn: (data: InsertContract) => apiRequest("POST", "/api/contracts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/paged"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts-with-financials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deposits/contracts-by-department"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-analytics"] });
      closeCreateDialog();
      toast({ title: "계약이 등록되었습니다." });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "계약 등록에 실패했습니다.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/contracts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/paged"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts-with-financials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deposits/contracts-by-department"] });
      queryClient.invalidateQueries({ queryKey: ["/api/refunds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      toast({ title: "계약이 삭제되었습니다." });
    },
    onError: () => {
      toast({ title: "계약 삭제에 실패했습니다.", variant: "destructive" });
    },
  });

  const bulkMarkDepositConfirmedMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiRequest("POST", "/api/contracts/bulk-mark-deposit-confirmed", { ids }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/contracts"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/contracts/paged"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/contracts-with-financials"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/payments"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/deposits"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/deposits/contracts-by-department"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/sales-analytics"] }),
      ]);
      setSelectedItems([]);
      setSelectedRowMap({});
      toast({ title: "선택 계약의 결제확인을 입금확인으로 변경했습니다." });
    },
    onError: () => {
      toast({ title: "입금확인 일괄 변경에 실패했습니다.", variant: "destructive" });
    },
  });

  const updatePaymentMutation = useMutation({
    mutationFn: ({ id, paymentConfirmed }: { id: string; paymentConfirmed: boolean }) =>
      apiRequest("PUT", `/api/contracts/${id}`, { paymentConfirmed }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/paged"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts-with-financials"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertContract> }) => {
      const res = await apiRequest("PUT", `/api/contracts/${id}`, data);
      return (await res.json()) as Contract;
    },
    onSuccess: (updatedContract) => {
      queryClient.setQueriesData<Contract[]>({ queryKey: ["/api/contracts"] }, (previousData) =>
        Array.isArray(previousData)
          ? previousData.map((contract) =>
              contract.id === updatedContract.id ? { ...contract, ...updatedContract } : contract,
            )
          : previousData,
      );
      queryClient.setQueriesData<PagedContractsResponse>({ queryKey: ["/api/contracts/paged"] }, (previousData) =>
        replaceContractInPagedResponse(previousData, updatedContract),
      );
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/paged"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts-with-financials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deposits/contracts-by-department"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/refunds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-analytics"] });
      setIsEditOpen(false);
      setEditingContractId(null);
      resetForm();
      toast({ title: "계약이 수정되었습니다." });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "계약 수정에 실패했습니다.", variant: "destructive" });
    },
  });

  const overrideWorkCostMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertContract> }) =>
      apiRequest("PUT", `/api/contracts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/paged"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts-with-financials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      setIsWorkCostOverrideOpen(false);
      setWorkCostOverrideContractId(null);
      setWorkCostOverrideItemId(null);
      setOverrideWorker("");
      setOverrideWorkCostAmount(0);
      toast({ title: "작업비 수정이 반영되었습니다." });
    },
    onError: () => {
      toast({ title: "작업비 수정에 실패했습니다.", variant: "destructive" });
    },
  });

  const { data: refundHistory = [] } = useQuery<Refund[]>({
    queryKey: ["/api/refunds", refundContractId, refundTargetItem?.id || null],
    queryFn: () => {
      const params = new URLSearchParams();
      if (refundTargetItem?.id) params.set("itemId", refundTargetItem.id);
      const query = params.toString();
      return fetch(`/api/refunds/${refundContractId}${query ? `?${query}` : ""}`, { credentials: "include" }).then(r => r.json());
    },
    enabled: !!refundContractId,
  });

  const refundMutation = useMutation({
    mutationFn: (data: {
      contractId: string;
      itemId: string | null;
      userIdentifier: string | null;
      productName: string | null;
      days: number;
      addQuantity: number;
      extendQuantity: number;
      targetAmount: number;
      amount: number;
      quantity: number;
      refundDays: number;
      account: string;
      slot: string;
      worker: string;
      reason: string;
      refundDate: Date;
      createdBy: string;
    }) =>
      apiRequest("POST", "/api/refunds", {
        contractId: data.contractId,
        itemId: data.itemId,
        userIdentifier: data.userIdentifier,
        productName: data.productName,
        days: data.days,
        addQuantity: data.addQuantity,
        extendQuantity: data.extendQuantity,
        targetAmount: data.targetAmount,
        amount: data.amount,
        quantity: data.quantity,
        refundDays: data.refundDays,
        account: data.account,
        slot: data.slot,
        worker: data.worker,
        reason: data.reason,
        refundDate: data.refundDate,
        createdBy: data.createdBy,
        refundStatus: "환불대기",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/paged"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts-with-financials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/refunds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/refunds", refundContractId, refundTargetItem?.id || null] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
      setPaymentFilter("all");
      setRefundAmount(0);
      setRefundQuantity(0);
      setRefundDays(0);
      setRefundAccount("");
      setRefundSlot("");
      setRefundWorker("");
      setRefundReason("");
      toast({ title: "환불이 환불관리 목록에 등록되었습니다." });
      setIsRefundOpen(false);
      setRefundContractId(null);
      setRefundTargetItem(null);
    },
    onError: (error: Error) => {
      toast({ title: error.message || "환불 등록에 실패했습니다.", variant: "destructive" });
    },
  });

  const currentUser = loggedInUser || null;
  const resolveManagerSelection = (
    managerNameValue: string | null | undefined,
    managerIdValue?: string | null | undefined,
  ) => {
    const normalizedManagerId = String(managerIdValue || "").trim();
    const normalizedManagerName = String(managerNameValue || "").trim();
    const selectedManager =
      (normalizedManagerId ? users.find((user) => String(user.id) === normalizedManagerId) : undefined) ||
      (normalizedManagerName ? users.find((user) => user.name === normalizedManagerName) : undefined) ||
      (currentUser &&
      ((normalizedManagerId && String(currentUser.id) === normalizedManagerId) ||
        (normalizedManagerName && currentUser.name === normalizedManagerName))
        ? currentUser
        : undefined);

    return {
      managerId: selectedManager?.id || normalizedManagerId || undefined,
      managerName: selectedManager?.name || normalizedManagerName || currentUser?.name || "",
    };
  };
  const handleManagerChange = (value: string) => {
    const selectedManager = users.find((user) => user.name === value);
    setFormData((prev) => ({
      ...prev,
      managerId: selectedManager?.id || undefined,
      managerName: value,
    }));
  };
  const showProfitColumns = currentUser?.role !== "B";
  const contractsTableColSpan = showProfitColumns ? 17 : 14;
  const isEditReadOnly = editDialogMode === "view";
  const matchedDepositForEditingContract = editingContractId
    ? linkedDepositByContractId.get(editingContractId) ?? null
    : null;
  const isPaymentMethodLocked = !isEditReadOnly && !!matchedDepositForEditingContract;

  const resetForm = () => {
    setFormData(getDefaultContractFormData());
    setProductItems([createEmptyProductItem("1")]);
    setProductItemNumericDrafts({});
    setIsWorkCostOverrideOpen(false);
    setWorkCostOverrideContractId(null);
    setWorkCostOverrideItemId(null);
    setWorkCostOverrideFormItemId(null);
    setOverrideWorker("");
    setOverrideWorkCostAmount(0);
  };

  const closeCreateDialog = () => {
    setIsCreateOpen(false);
    setCreateDialogMode("create");
    setCreateDialogRenderKey((prev) => prev + 1);
    resetForm();
  };

  const handleCreateDialogOpenChange = (open: boolean) => {
    if (open) {
      setIsCreateOpen(true);
      return;
    }

    closeCreateDialog();
  };

  const handleOpenCreateDialog = () => {
    setCreateDialogMode("create");
    setCreateDialogRenderKey((prev) => prev + 1);
    resetForm();
    setIsCreateOpen(true);
  };

  // Product item calculations
  const toNonNegativeInt = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
  const toNonNegativeAmount = (v: unknown) => Math.max(0, Number(v) || 0);
  const toNonNegativeWholeAmount = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
  const parseOptionalNonNegativeInt = (raw: string) => {
    if (raw.trim() === "") return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
  };
  const parseKoreanDateInput = (value: string, fallback: Date = getKoreanNow()) => {
    if (!value) return fallback;
    const parsed = new Date(`${value}T12:00:00+09:00`);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  };
  const getItemQuantity = (item: ProductItem) => toNonNegativeInt(item.addQuantity) + toNonNegativeInt(item.extendQuantity);
  const getLegacyCompatibleQuantity = (
    addQuantityValue: unknown,
    extendQuantityValue: unknown,
    fallbackQuantityValue: unknown,
  ) => {
    const addQuantity = toNonNegativeInt(addQuantityValue);
    const extendQuantity = toNonNegativeInt(extendQuantityValue);
    const combinedQuantity = addQuantity + extendQuantity;
    if (combinedQuantity > 0) {
      return {
        addQuantity,
        extendQuantity,
        quantity: combinedQuantity,
      };
    }

    const fallbackQuantity = toNonNegativeInt(fallbackQuantityValue);
    if (fallbackQuantity > 0) {
      return {
        addQuantity: fallbackQuantity,
        extendQuantity: 0,
        quantity: fallbackQuantity,
      };
    }

    return {
      addQuantity,
      extendQuantity,
      quantity: 0,
    };
  };
  const getProductByName = (productName: string) => products.find((p) => p.name === productName);
  const productHistoryMap = useMemo(() => {
    const map = new Map<string, ProductRateHistory[]>();
    for (const history of productRateHistories) {
      const key = String(history.productName || "").trim();
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(history);
    }
    Array.from(map.values()).forEach((list) => {
      list.sort((a: ProductRateHistory, b: ProductRateHistory) => {
        const effectiveDiff = new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime();
        if (effectiveDiff !== 0) return effectiveDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    });
    return map;
  }, [productRateHistories]);
  const resolveProductSnapshotAtDate = (productName: string, contractDate: Date | string | null | undefined) => {
    const normalizedName = (productName || "").trim();
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
    return getProductByName(normalizedName);
  };
  const isViralCategory = (category: string | null | undefined) => (category ?? "").replace(/\s+/g, "") === "바이럴상품";
  const isViralItem = (item: ProductItem) => isViralCategory(getProductByName(item.productName)?.category);
  const getEffectiveDays = (item: ProductItem) => (isViralItem(item) ? 1 : Math.max(1, toNonNegativeInt(item.days) || 1));

  // 공급가액 = 단가 * 수량(추가+연장)
  const calculateSupplyAmount = (item: ProductItem) => {
    if (item.supplyAmount !== null && item.supplyAmount !== undefined) {
      const storedSupplyAmount = Number(item.supplyAmount);
      if (Number.isFinite(storedSupplyAmount) && storedSupplyAmount >= 0) {
        return storedSupplyAmount;
      }
    }
    return item.unitPrice * getItemQuantity(item);
  };

  // 작업비 = (작업단가 / 기준일수) * 수량(추가+연장) * 일수
  // 행(item)에 담긴 값을 우선 사용하고, 없으면 상품 마스터 값으로 보완
  const calculateWorkCost = (item: ProductItem, paymentMethodOverride?: string | null | undefined) => {
    if (item.fixedWorkCostAmount !== null && item.fixedWorkCostAmount !== undefined) {
      return toNonNegativeAmount(item.fixedWorkCostAmount);
    }
    const snapshot = resolveProductSnapshotAtDate(item.productName, formData.contractDate);
    const product = getProductByName(item.productName);
    const storedWorkerUnitCost = Math.max(0, Number(item.workCost) || 0);
    const workerUnitCost = storedWorkerUnitCost > 0
      ? storedWorkerUnitCost
      : Math.max(0, Number(snapshot?.workCost) || 0, Number(product?.workCost) || 0);
    if (workerUnitCost <= 0) return 0;

    const storedBaseDays = Math.max(0, toNonNegativeInt(item.baseDays) || 0);
    const workerBaseDays = storedBaseDays > 0
      ? storedBaseDays
      : Math.max(1, toNonNegativeInt(snapshot?.baseDays) || 0, toNonNegativeInt(product?.baseDays) || 0, 1);
    const dailyWorkCost = workerUnitCost / workerBaseDays;
    return dailyWorkCost * getItemQuantity(item) * getEffectiveDays(item);
  };

  const calculateVat = (item: ProductItem) => {
    if (normalizeVatType(item.vatType) === "포함") {
      return calculateSupplyAmount(item) * 0.1;
    }
    return 0;
  };

  const normalizeVatType = (vat: unknown) => {
    const normalized = String(vat || "").replace(/\s+/g, "");
    const asciiKey = normalized.replace(/[_-]/g, "").toLowerCase();
    if (!normalized) return "미포함";
    if (["부가세별도", "별도", "미포함", "면세"].includes(normalized)) return "미포함";
    if (["부가세포함", "포함"].includes(normalized)) return "포함";
    if (["excluded", "exclude", "exclusive", "vatexcluded", "withoutvat", "novat", "taxfree", "separate"].includes(asciiKey)) return "미포함";
    if (["included", "include", "inclusive", "vatincluded", "withvat"].includes(asciiKey)) return "포함";
    return "미포함";
  };

  const normalizeDisbursementStatus = (value: unknown) => {
    const raw = normalizeText(String(value ?? ""));
    const normalized = raw.replace(/\s+/g, "");
    const asciiKey = normalized.replace(/[_-]/g, "").toLowerCase();
    if (!normalized) return "";
    if (["지급예정", "지급대기", "지급요청", "지급완료", "일반지급", "지급보류"].includes(raw)) return raw;
    if (["scheduled", "expected", "planned"].includes(asciiKey)) return "지급예정";
    if (["pending", "wait", "waiting", "queued", "queue", "ready"].includes(asciiKey)) return "지급대기";
    if (["request", "requested"].includes(asciiKey)) return "지급요청";
    if (["complete", "completed", "done", "paid"].includes(asciiKey)) return "지급완료";
    if (["normal", "standard", "general"].includes(asciiKey)) return "일반지급";
    if (["hold", "onhold", "withheld", "pause", "paused"].includes(asciiKey)) return "지급보류";
    if (/^[a-z0-9 _-]+$/i.test(raw)) return "";
    return raw;
  };

  const normalizePaymentMethodForForm = (value: unknown) => {
    const raw = normalizeText(String(value ?? ""));
    const normalized = raw.replace(/\s+/g, "");
    const asciiKey = normalized.replace(/[_-]/g, "").toLowerCase();
    if (!normalized) return DEFAULT_CREATE_PAYMENT_METHOD;
    if (
      ["입금 전", "입금전"].includes(raw) ||
      ["beforedeposit", "pendingdeposit", "beforepayment", "unpaid"].includes(asciiKey)
    ) {
      return "입금 전";
    }
    if (
      ["입금확인", "입금완료", "하나", "국민", "농협", "하나은행", "국민은행", "농협은행"].includes(raw) ||
      ["deposit", "deposited", "banktransfer", "transfer", "confirmed", "hana", "hanabank", "kb", "kookmin", "kbstar", "nonghyup", "nh"].includes(asciiKey)
    ) {
      return "입금확인";
    }
    if (["환불요청", "환불처리", "환불등록"].includes(raw) || ["refund", "refunded", "refundrequest", "refundrequested"].includes(asciiKey)) {
      return "환불요청";
    }
    if (["적립금사용", "적립금 사용", "적립금", "적립"].includes(raw) || ["usekeep", "usecredit", "credituse", "keepuse", "keep", "credit"].includes(asciiKey)) {
      return "적립금사용";
    }
    if (["체크", "기타"].includes(raw) || ["check", "other", "etc"].includes(asciiKey)) {
      return "기타";
    }
    if (/^[a-z0-9 _-]+$/i.test(raw)) return DEFAULT_CREATE_PAYMENT_METHOD;
    return raw;
  };

  const normalizeDepositBankForForm = (value: unknown, fallbackPaymentMethod?: unknown) => {
    const raw = normalizeText(String(value ?? "")) || normalizeText(String(fallbackPaymentMethod ?? ""));
    const normalized = raw.replace(/\s+/g, "");
    const asciiKey = normalized.replace(/[_-]/g, "").toLowerCase();
    if (
      ["하나", "하나은행"].includes(raw) ||
      ["hana", "hanabank"].includes(asciiKey)
    ) {
      return "하나은행";
    }
    if (
      ["국민", "국민은행"].includes(raw) ||
      ["kb", "kookmin", "kbstar"].includes(asciiKey)
    ) {
      return "국민은행";
    }
    if (
      ["농협", "농협은행"].includes(raw) ||
      ["nonghyup", "nh"].includes(asciiKey)
    ) {
      return "농협은행";
    }
    if (
      ["카드 결제", "카드결제"].includes(raw) ||
      ["card", "cardpayment", "creditcard"].includes(asciiKey)
    ) {
      return "카드 결제";
    }
    if (raw === "기타" || asciiKey === "other") {
      return "기타";
    }
    return DEFAULT_CREATE_DEPOSIT_BANK;
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

  const deriveInvoiceIssuedText = (
    items: ProductItem[],
    fallbackValue?: string | null,
  ): string => {
    const firstVatType = items.find((item) => String(item.vatType || "").trim())?.vatType;
    if (firstVatType) {
      return normalizeVatType(firstVatType) === "포함" ? "포함" : "미포함";
    }

    const parsedFallback = parseInvoiceIssued(fallbackValue);
    if (parsedFallback === null) {
      return "";
    }

    return parsedFallback ? "포함" : "미포함";
  };

  const inferBaseAmountFromTotalWithVat = (totalAmount: number) => {
    const safeTotalAmount = toNonNegativeAmount(totalAmount);
    if (safeTotalAmount <= 0) return 0;
    return safeTotalAmount / 1.1;
  };

  const splitStoredListValue = (value: string | null | undefined) =>
    String(value || "")
      .split(",")
      .map((entry) => entry.trim());

  const normalizeProductItemsForStorage = (items: ProductItem[]) =>
    items
      .filter((item) => String(item.productName || "").trim())
      .map((item) => {
        const supplyAmount = calculateSupplyAmount(item);
        const vatAmount = calculateVat(item);
        const workCostAmount = calculateWorkCost(item);
        const hasStoredGrossSupplyAmount = item.grossSupplyAmount !== null && item.grossSupplyAmount !== undefined;
        const storedGrossSupplyAmount = hasStoredGrossSupplyAmount ? Number(item.grossSupplyAmount) : Number.NaN;
        const storedRefundAmount = Number(item.refundAmount);
        const storedNegativeAdjustmentAmount = Number(item.negativeAdjustmentAmount);
        const hasStoredMarginAmount = item.marginAmount !== null && item.marginAmount !== undefined;
        const storedMarginAmount = hasStoredMarginAmount ? Number(item.marginAmount) : Number.NaN;

        return {
          id: item.id,
          productName: String(item.productName || "").trim(),
          userIdentifier: String(item.userIdentifier || "").trim(),
          vatType: normalizeVatType(item.vatType),
          unitPrice: Math.max(0, Number(item.unitPrice) || 0),
          days: getEffectiveDays(item),
          addQuantity: toNonNegativeInt(item.addQuantity),
          extendQuantity: toNonNegativeInt(item.extendQuantity),
          quantity: getItemQuantity(item),
          baseDays: Math.max(1, toNonNegativeInt(item.baseDays) || 1),
          worker: String(item.worker || "").trim(),
          workCost: Math.max(0, Number(item.workCost) || 0),
          fixedWorkCostAmount:
            item.fixedWorkCostAmount === null || item.fixedWorkCostAmount === undefined
              ? null
              : toNonNegativeAmount(item.fixedWorkCostAmount),
          disbursementStatus: normalizeDisbursementStatus(item.disbursementStatus),
          supplyAmount,
          grossSupplyAmount: hasStoredGrossSupplyAmount && Number.isFinite(storedGrossSupplyAmount)
            ? Math.max(0, storedGrossSupplyAmount)
            : supplyAmount + vatAmount,
          refundAmount: Number.isFinite(storedRefundAmount)
            ? Math.max(0, storedRefundAmount)
            : 0,
          negativeAdjustmentAmount: Number.isFinite(storedNegativeAdjustmentAmount)
            ? storedNegativeAdjustmentAmount
            : 0,
          marginAmount: hasStoredMarginAmount && Number.isFinite(storedMarginAmount)
            ? storedMarginAmount
            : supplyAmount - workCostAmount,
        };
      });

  const parseStoredProductItems = (contract: Contract): ProductItem[] => {
    const rawJson = String((contract as Contract & { productDetailsJson?: string | null }).productDetailsJson || "").trim();
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson);
        if (Array.isArray(parsed)) {
          const hydratedItems = parsed
            .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
            .map((item, index): ProductItem | null => {
              const productName = String(item.productName || "").trim();
              if (!productName) return null;
              const product = getProductByName(productName);
              const snapshot = resolveProductSnapshotAtDate(productName, contract.contractDate);
              const viralProduct = isViralCategory(product?.category);
              const baseDays = viralProduct
                ? 1
                : Math.max(
                    1,
                    Number(item.baseDays) || 0,
                    Number(snapshot?.baseDays ?? product?.baseDays) || 0,
                    1,
                  );
              const { addQuantity, extendQuantity, quantity } = getLegacyCompatibleQuantity(
                item.addQuantity,
                item.extendQuantity,
                item.quantity,
              );
              const hydratedItem: ProductItem = {
                id: String(item.id || index + 1),
                productName,
                userIdentifier: String(item.userIdentifier || "").trim(),
                vatType: normalizeVatType(String(item.vatType ?? snapshot?.vatType ?? product?.vatType ?? "")),
                unitPrice: Math.max(0, Number(item.unitPrice) || 0),
                days: viralProduct ? 1 : Math.max(1, Number(item.days) || baseDays || 1),
                addQuantity,
                extendQuantity,
                quantity,
                baseDays,
                worker: String(item.worker ?? snapshot?.worker ?? product?.worker ?? "").trim(),
                workCost: Math.max(0, Number(item.workCost) || Number(snapshot?.workCost ?? product?.workCost) || 0),
                fixedWorkCostAmount:
                  item.fixedWorkCostAmount === null || item.fixedWorkCostAmount === undefined
                    ? null
                    : Math.max(0, Number(item.fixedWorkCostAmount) || 0),
                disbursementStatus: normalizeDisbursementStatus(item.disbursementStatus ?? contract.disbursementStatus ?? ""),
                supplyAmount:
                  item.supplyAmount === null || item.supplyAmount === undefined
                    ? null
                    : Math.max(0, Number(item.supplyAmount) || 0),
                grossSupplyAmount:
                  item.grossSupplyAmount === null || item.grossSupplyAmount === undefined
                    ? null
                    : Math.max(0, Number(item.grossSupplyAmount) || 0),
                refundAmount:
                  item.refundAmount === null || item.refundAmount === undefined
                    ? null
                    : Math.max(0, Number(item.refundAmount) || 0),
                negativeAdjustmentAmount:
                  item.negativeAdjustmentAmount === null || item.negativeAdjustmentAmount === undefined
                    ? null
                    : Number(item.negativeAdjustmentAmount) || 0,
                marginAmount:
                  item.marginAmount === null || item.marginAmount === undefined
                    ? null
                    : Number(item.marginAmount) || 0,
              };
              return hydratedItem;
            });
          const hydrated = hydratedItems.filter((item): item is ProductItem => item !== null);

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
      return [createEmptyProductItem("1")];
    }

    const invoiceIssuedFlag = parseInvoiceIssued(contract.invoiceIssued);
    const contractVatType = invoiceIssuedFlag === null ? null : (invoiceIssuedFlag ? "포함" : "미포함");
    const totalContractCost = Math.max(0, Number(contract.cost) || 0);
    const derivedContractBaseAmount = totalContractCost;

    return productNames.map((name, idx) => {
      const product = getProductByName(name);
      const snapshot = resolveProductSnapshotAtDate(name, contract.contractDate);
      const viralProduct = isViralCategory(product?.category);
      const { addQuantity, extendQuantity, quantity } = getLegacyCompatibleQuantity(
        (contract as Contract & { addQuantity?: number | null }).addQuantity,
        (contract as Contract & { extendQuantity?: number | null }).extendQuantity,
        contract.quantity,
      );
      const itemCount = Math.max(1, productNames.length);
      const baseAmountPerItem = itemCount === 1
        ? derivedContractBaseAmount
        : derivedContractBaseAmount / itemCount;
      const fallbackUnitPrice = baseAmountPerItem > 0 && quantity > 0
        ? Math.max(0, baseAmountPerItem / quantity)
        : 0;
      return {
        id: String(idx + 1),
        productName: name,
        userIdentifier: String(userIdentifiers[idx] || "").trim(),
        vatType: contractVatType ?? normalizeVatType(String(snapshot?.vatType ?? product?.vatType ?? "")),
        unitPrice: fallbackUnitPrice,
        days: viralProduct ? 1 : (Number(snapshot?.baseDays ?? product?.baseDays) || 1),
        addQuantity,
        extendQuantity,
        quantity,
        baseDays: viralProduct ? 1 : (Number(snapshot?.baseDays ?? product?.baseDays) || 0),
        worker: String(workerNames[idx] || (snapshot?.worker ?? product?.worker ?? "")).trim(),
        workCost: Number(snapshot?.workCost ?? product?.workCost) || 0,
        fixedWorkCostAmount: null,
          disbursementStatus: normalizeDisbursementStatus(contract.disbursementStatus),
        supplyAmount: null,
        grossSupplyAmount: null,
        refundAmount: null,
        negativeAdjustmentAmount: null,
        marginAmount: null,
      };
    });
  };

  const getContractDisplayItems = (contract: Contract) => {
    const parsedItems = parseStoredProductItems(contract).filter((item) => String(item.productName || "").trim());
    const invoiceIssuedFlag = parseInvoiceIssued(contract.invoiceIssued);
    const contractVatType = invoiceIssuedFlag === null ? null : (invoiceIssuedFlag ? "포함" : "미포함");
    const normalizedItems = parsedItems.map((item) => ({
      ...item,
      vatType: normalizeVatType(String(item.vatType ?? contractVatType ?? "")),
    }));
    return normalizedItems.length > 0 ? normalizedItems : [createEmptyProductItem("1")];
  };

  const buildContractPayloadFromItems = (contract: Contract, items: ProductItem[]): Partial<InsertContract> => {
    const validItems = items.filter((item) => String(item.productName || "").trim());
    const storedProductItems = normalizeProductItemsForStorage(validItems);
    const firstItem = validItems[0];
    return {
      products: storedProductItems.map((item) => item.productName).join(", "),
      cost: validItems.reduce((sum, item) => sum + calculateSupplyAmount(item), 0),
      days: firstItem ? getEffectiveDays(firstItem) : Number(contract.days) || 0,
      addQuantity: firstItem?.addQuantity || 0,
      extendQuantity: firstItem?.extendQuantity || 0,
      quantity: firstItem ? getItemQuantity(firstItem) : Math.max(0, Number(contract.quantity) || 0),
      workCost: validItems.reduce((sum, item) => sum + calculateWorkCost(item), 0),
      worker: storedProductItems.map((item) => item.worker).filter(Boolean).join(", "),
      userIdentifier: storedProductItems.map((item) => item.userIdentifier).filter(Boolean).join(", "),
      invoiceIssued: deriveInvoiceIssuedText(storedProductItems, contract.invoiceIssued),
      productDetailsJson: storedProductItems.length > 0 ? JSON.stringify(storedProductItems) : null,
    };
  };

  const addProductItem = () => {
    setProductItems([
      ...productItems,
      createEmptyProductItem(Date.now().toString()),
    ]);
  };

  const removeProductItem = (id: string) => {
    if (productItems.length > 1) {
      setProductItems(productItems.filter((item) => item.id !== id));
      setProductItemNumericDrafts((prev) => {
        const next = { ...prev };
        delete next[`${id}:unitPrice`];
        delete next[`${id}:days`];
        delete next[`${id}:addQuantity`];
        delete next[`${id}:extendQuantity`];
        return next;
      });
    }
  };

  const applyProductDefaults = (
    updated: ProductItem,
    selectedProduct: Product,
    contractDate: Date | string | null | undefined = formData.contractDate,
  ) => {
    const snapshot = resolveProductSnapshotAtDate(selectedProduct.name, contractDate);
    if (isViralCategory(selectedProduct.category)) {
      updated.baseDays = 1;
      updated.days = 1;
    } else {
      const resolvedBaseDays = Number(snapshot?.baseDays ?? selectedProduct.baseDays) || 0;
      updated.baseDays = resolvedBaseDays;
      updated.days = resolvedBaseDays || updated.days || 1;
    }
    updated.worker = String(snapshot?.worker ?? selectedProduct.worker ?? "");
    updated.workCost = Number(snapshot?.workCost ?? selectedProduct.workCost) || 0;
    updated.fixedWorkCostAmount = null;
    updated.vatType = normalizeVatType(String(snapshot?.vatType ?? selectedProduct.vatType ?? ""));
    return updated;
  };

  const updateProductItem = (id: string, fieldOrUpdates: keyof ProductItem | Partial<ProductItem>, value?: string | number) => {
    const nextProductItems = productItems.map((item) => {
      if (item.id === id) {
        let updated: ProductItem;
        if (typeof fieldOrUpdates === "object") {
          updated = { ...item, ...fieldOrUpdates };
          if ("productName" in fieldOrUpdates && fieldOrUpdates.productName) {
            const selectedProduct = products.find((p) => p.name === fieldOrUpdates.productName);
            if (selectedProduct) {
              applyProductDefaults(updated, selectedProduct);
            }
          }
        } else {
          updated = { ...item, [fieldOrUpdates]: value };
          if (fieldOrUpdates === "productName") {
            const selectedProduct = products.find((p) => p.name === value);
            if (selectedProduct) {
              applyProductDefaults(updated, selectedProduct);
            }
          }
          if (fieldOrUpdates === "workCost") {
            updated.fixedWorkCostAmount = null;
          }
        }
        const addQuantity = toNonNegativeInt(updated.addQuantity);
        const extendQuantity = toNonNegativeInt(updated.extendQuantity);
        updated.addQuantity = addQuantity;
        updated.extendQuantity = extendQuantity;
        updated.quantity = addQuantity + extendQuantity;
        updated.supplyAmount = null;
        updated.grossSupplyAmount = null;
        updated.marginAmount = null;
        const selectedProduct = getProductByName(updated.productName);
        if (selectedProduct && isViralCategory(selectedProduct.category)) {
          updated.days = 1;
          updated.baseDays = 1;
        }
        return updated;
      }
      return item;
    });

    setProductItems(nextProductItems);
    setFormData((prev) => ({
      ...prev,
      invoiceIssued: deriveInvoiceIssuedText(nextProductItems, prev.invoiceIssued),
    }));
  };

  const getProductItemDraftKey = (id: string, field: EditableNumericProductField) => `${id}:${field}`;

  const getProductItemNumericInputValue = (item: ProductItem, field: EditableNumericProductField) => {
    const draftKey = getProductItemDraftKey(item.id, field);
    if (Object.prototype.hasOwnProperty.call(productItemNumericDrafts, draftKey)) {
      return productItemNumericDrafts[draftKey];
    }
    return String(item[field] ?? "");
  };

  const handleProductItemNumericInputChange = (
    item: ProductItem,
    field: EditableNumericProductField,
    rawValue: string,
  ) => {
    const draftKey = getProductItemDraftKey(item.id, field);
    setProductItemNumericDrafts((prev) => ({ ...prev, [draftKey]: rawValue }));

    if (rawValue.trim() === "") {
      return;
    }

    const parsed = Number.parseInt(rawValue, 10);
    if (Number.isNaN(parsed)) {
      return;
    }

    updateProductItem(item.id, field, Math.max(0, parsed));
  };

  const handleProductItemNumericInputBlur = (
    item: ProductItem,
    field: EditableNumericProductField,
    fallbackValue: number,
  ) => {
    const draftKey = getProductItemDraftKey(item.id, field);
    const rawValue = productItemNumericDrafts[draftKey];
    if (rawValue === undefined) {
      return;
    }

    if (rawValue.trim() === "") {
      updateProductItem(item.id, field, fallbackValue);
    }

    setProductItemNumericDrafts((prev) => {
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });
  };

  // Calculate totals
  const totalDays = productItems.reduce((sum, item) => sum + getEffectiveDays(item), 0);
  const totalQuantity = productItems.reduce((sum, item) => sum + getItemQuantity(item), 0);
  const totalWorkCost = productItems.reduce((sum, item) => sum + calculateWorkCost(item), 0);
  const totalSupplyAmount = productItems.reduce((sum, item) => sum + calculateSupplyAmount(item), 0);
  const totalVat = productItems.reduce((sum, item) => sum + calculateVat(item), 0);
  const totalAmount = totalSupplyAmount + totalVat;

  const handleCreate = () => {
    if (!formData.customerName) {
      toast({ title: "필수 항목을 입력해주세요.", variant: "destructive" });
      return;
    }
    
    const storedProductItems = normalizeProductItemsForStorage(productItems);
    const productNames = storedProductItems.map((item) => item.productName).join(", ");
    const workerNames = storedProductItems.map((item) => item.worker).filter(Boolean).join(", ");
    const userIdentifiers = storedProductItems.map((item) => item.userIdentifier).filter(Boolean).join(", ");
    const autoContractNumber = formData.contractNumber || `CT-${format(new Date(), "yyyyMMddHHmmss")}`;
    const firstProduct = storedProductItems[0];
    const managerSelection = resolveManagerSelection(formData.managerName, formData.managerId);
    const finalData = {
      ...formData,
      contractNumber: autoContractNumber,
      managerId: managerSelection.managerId,
      managerName: managerSelection.managerName,
      products: productNames,
      cost: totalSupplyAmount,
      days: firstProduct ? getEffectiveDays(firstProduct) : 0,
      addQuantity: firstProduct?.addQuantity || 0,
      extendQuantity: firstProduct?.extendQuantity || 0,
      quantity: firstProduct ? getItemQuantity(firstProduct) : 0,
      workCost: totalWorkCost,
      worker: workerNames,
      userIdentifier: userIdentifiers,
      paymentMethod: normalizePaymentMethodForForm(formData.paymentMethod),
      depositBank: normalizeDepositBankForForm(formData.depositBank, formData.paymentMethod),
      invoiceIssued: deriveInvoiceIssuedText(storedProductItems, formData.invoiceIssued),
      productDetailsJson: storedProductItems.length > 0 ? JSON.stringify(storedProductItems) : null,
    };
    
    createMutation.mutate(finalData as InsertContract);
  };

  const openContractDialog = (contractToOpen: Contract, mode: "edit" | "view") => {
    setEditDialogMode(mode);
    setEditingContractId(contractToOpen.id);
    const displayItems = getContractDisplayItems(contractToOpen);
    setFormData({
      contractNumber: contractToOpen.contractNumber,
      contractDate: new Date(contractToOpen.contractDate),
      managerId: contractToOpen.managerId || undefined,
      managerName: contractToOpen.managerName,
      customerId: contractToOpen.customerId || undefined,
      customerName: contractToOpen.customerName,
      products: contractToOpen.products || "",
      cost: contractToOpen.cost,
      paymentConfirmed: contractToOpen.paymentConfirmed || false,
      paymentMethod: normalizePaymentMethodForForm(contractToOpen.paymentMethod),
      depositBank: normalizeDepositBankForForm(
        (contractToOpen as Contract & { depositBank?: string | null }).depositBank,
        contractToOpen.paymentMethod,
      ),
      invoiceIssued: deriveInvoiceIssuedText(displayItems, contractToOpen.invoiceIssued),
      worker: contractToOpen.worker || "",
      notes: contractToOpen.notes || "",
      disbursementStatus: normalizeDisbursementStatus(contractToOpen.disbursementStatus),
      userIdentifier: contractToOpen.userIdentifier || "",
    });

    setProductItemNumericDrafts({});
    setProductItems(displayItems);

    setIsEditOpen(true);
  };

  const handleCopyToCreateDialog = () => {
    if (selectedContractIds.length === 0) {
      toast({ title: "복사할 항목을 선택해주세요.", variant: "destructive" });
      return;
    }

    if (selectedContractIds.length > 1) {
      toast({ title: "복사할 계약 1건만 선택해주세요.", variant: "destructive" });
      return;
    }

    const sourceContract = contracts.find((contract) => contract.id === selectedContractIds[0]);
    if (!sourceContract) {
      toast({ title: "복사할 계약을 찾을 수 없습니다.", variant: "destructive" });
      return;
    }

    const today = getKoreanNow();
    resetForm();
    setCreateDialogMode("copy");
    setCreateDialogRenderKey((prev) => prev + 1);
    const displayItems = getContractDisplayItems(sourceContract);
    setFormData({
      contractNumber: "",
      contractDate: today,
      managerId: sourceContract.managerId || undefined,
      managerName: sourceContract.managerName || currentUser?.name || "",
      customerId: sourceContract.customerId || undefined,
      customerName: sourceContract.customerName || "",
      products: sourceContract.products || "",
      cost: sourceContract.cost || 0,
      paymentConfirmed: false,
      paymentMethod: DEFAULT_CREATE_PAYMENT_METHOD,
      depositBank: DEFAULT_CREATE_DEPOSIT_BANK,
      invoiceIssued: deriveInvoiceIssuedText(displayItems, sourceContract.invoiceIssued),
      worker: sourceContract.worker || "",
      notes: sourceContract.notes || "",
      disbursementStatus: normalizeDisbursementStatus(sourceContract.disbursementStatus),
      userIdentifier: sourceContract.userIdentifier || "",
    });
    setProductItemNumericDrafts({});
    setProductItems(displayItems);
    setIsCreateOpen(true);
    toast({ title: "계약 복사본을 불러왔습니다. 계약일은 오늘로 설정했습니다." });
  };

  const handleUpdate = () => {
    if (!formData.customerName || !editingContractId) {
      toast({ title: "필수 항목을 입력해주세요.", variant: "destructive" });
      return;
    }
    
    const storedProductItems = normalizeProductItemsForStorage(productItems);
    const productNames = storedProductItems.map((item) => item.productName).join(", ");
    const workerNames = storedProductItems.map((item) => item.worker).filter(Boolean).join(", ");
    const userIdentifiers = storedProductItems.map((item) => item.userIdentifier).filter(Boolean).join(", ");
    const firstProduct = storedProductItems[0];
    const managerSelection = resolveManagerSelection(formData.managerName, formData.managerId);
    const finalData = {
      ...formData,
      managerId: managerSelection.managerId,
      managerName: managerSelection.managerName,
      products: productNames,
      cost: totalSupplyAmount,
      days: firstProduct ? getEffectiveDays(firstProduct) : 0,
      addQuantity: firstProduct?.addQuantity || 0,
      extendQuantity: firstProduct?.extendQuantity || 0,
      quantity: firstProduct ? getItemQuantity(firstProduct) : 0,
      workCost: totalWorkCost,
      worker: workerNames,
      userIdentifier: userIdentifiers,
      paymentMethod: normalizePaymentMethodForForm(formData.paymentMethod),
      depositBank: normalizeDepositBankForForm(formData.depositBank, formData.paymentMethod),
      invoiceIssued: deriveInvoiceIssuedText(storedProductItems, formData.invoiceIssued),
      productDetailsJson: storedProductItems.length > 0 ? JSON.stringify(storedProductItems) : null,
    };
    
    updateMutation.mutate({ id: editingContractId, data: finalData as Partial<InsertContract> });
  };

  const filteredContracts = contracts;
  const paginatedContracts = contracts;
  const totalPages = Math.max(1, Math.ceil(totalFilteredContracts / pageSize));
  const getContractRowKey = (contract: Contract, item: ProductItem, itemIndex: number) =>
    `${contract.id}::${String(item.id || itemIndex + 1)}::${itemIndex}`;
  const contractRows = useMemo<ContractListRow[]>(
    () =>
      paginatedContracts.flatMap((contract) => {
        const contractItems = getContractDisplayItems(contract).filter((item) => String(item.productName || "").trim());
        const visibleItems = contractItems.length > 0 ? contractItems : [createEmptyProductItem("1")];
        return visibleItems.map((item, itemIndex) => ({
          rowKey: getContractRowKey(contract, item, itemIndex),
          contract,
          item,
          itemIndex,
        }));
      }),
    [paginatedContracts, products, productRateHistories],
  );
  useEffect(() => {
    setSelectedRowMap((prev) => {
      const next: Record<string, ContractListRow> = {};

      selectedItems.forEach((rowKey) => {
        if (prev[rowKey]) {
          next[rowKey] = prev[rowKey];
        }
      });

      contractRows.forEach((row) => {
        if (selectedItems.includes(row.rowKey)) {
          next[row.rowKey] = row;
        }
      });

      return next;
    });
  }, [contractRows, selectedItems]);
  const selectedRows = useMemo(
    () => selectedItems.map((rowKey) => selectedRowMap[rowKey]).filter((row): row is ContractListRow => !!row),
    [selectedItems, selectedRowMap],
  );
  const selectedContractIds = useMemo(
    () => Array.from(new Set(selectedRows.map((row) => row.contract.id))),
    [selectedRows],
  );
  const singleSelectedRow = selectedRows.length === 1 ? selectedRows[0] : null;
  const allVisibleRowKeys = contractRows.map((row) => row.rowKey);
  const isAllVisibleRowsSelected =
    allVisibleRowKeys.length > 0 && allVisibleRowKeys.every((rowKey) => selectedItems.includes(rowKey));

  const refundContract = contracts.find(c => c.id === refundContractId);
  const historyTotalRefunded = refundHistory.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const totalRefunded = historyTotalRefunded;
  const previewRefundAmount = toNonNegativeWholeAmount(refundAmount);
  const refundTargetAmount = Math.max(
    0,
    refundTargetItem ? calculateSupplyAmount(refundTargetItem) : Math.max(0, Number(refundContract?.cost) || 0),
  );
  const displayTotalRefunded = Math.min(refundTargetAmount, totalRefunded + previewRefundAmount);
  const displayRemainingRefund = Math.max(0, refundTargetAmount - displayTotalRefunded);


  // 환불 자동계산: (계약금액 / 계약수량 / 계약일수) * 환불수량 * 환불일수
  // 환불금액은 계약금액 및 잔여금액을 초과할 수 없음
  const calculateAutoRefundAmount = (
    contract: Contract | undefined,
    targetItem: ProductItem | null,
    quantityValue: number,
    refundDaysValue: number,
  ) => {
    if (!contract) return 0;
    const quantity = Math.max(0, toNonNegativeInt(quantityValue));
    const refundDaysInt = Math.max(0, toNonNegativeInt(refundDaysValue));
    if (quantity <= 0 || refundDaysInt <= 0) return 0;

    const baseAmount = Math.max(
      0,
      targetItem ? calculateSupplyAmount(targetItem) : Math.max(0, Number(contract.cost) || 0),
    );
    const baseQuantity = Math.max(
      1,
      targetItem
        ? getItemQuantity(targetItem)
        : (
            Math.max(0, Number(contract.addQuantity) || 0) + Math.max(0, Number(contract.extendQuantity) || 0) > 0
              ? Math.max(0, Number(contract.addQuantity) || 0) + Math.max(0, Number(contract.extendQuantity) || 0)
              : Math.max(1, Number(contract.quantity) || 1)
          ),
    );
    const baseDays = Math.max(1, targetItem ? getEffectiveDays(targetItem) : Number(contract.days) || 1);
    const unitPerDay = baseAmount / baseQuantity / baseDays;
    const computedAmount = unitPerDay * refundDaysInt * quantity;
    const remainingItemAmount = Math.max(0, baseAmount - totalRefunded);
    return toNonNegativeWholeAmount(Math.min(Math.max(0, computedAmount), baseAmount, remainingItemAmount));
  };
  useEffect(() => {
    if (!isRefundOpen || !refundContract) return;
    setRefundAmount(calculateAutoRefundAmount(refundContract, refundTargetItem, refundQuantity, refundDays));
  }, [isRefundOpen, refundContractId, refundTargetItem, refundQuantity, refundDays, refundDate, totalRefunded]);

  const handleRefundOpen = () => {
    if (!singleSelectedRow) {
      toast({ title: "환불 처리할 항목을 하나만 선택해주세요.", variant: "destructive" });
      return;
    }
    const { contract, item } = singleSelectedRow;
    const defaultQuantity = getItemQuantity(item);
    const defaultRefundDays = getEffectiveDays(item);
    setRefundContractId(contract.id);
    setRefundDate(getKoreanNow());
    setRefundQuantity(defaultQuantity);
    setRefundDays(defaultRefundDays);
    setRefundTargetItem(item);
    setRefundAccount(item.userIdentifier || contract.userIdentifier || "");
    setRefundSlot(item.productName || contract.products || "");
    setRefundWorker(item.worker || contract.worker || "");
    setRefundReason("");
    setIsRefundOpen(true);
  };

  const handleBulkMarkDepositConfirmed = () => {
    if (selectedContractIds.length === 0) {
      toast({ title: "입금확인으로 변경할 항목을 선택해주세요.", variant: "destructive" });
      return;
    }

    if (!confirm(`선택한 ${selectedContractIds.length}개 계약의 결제확인을 입금확인으로 변경하시겠습니까?`)) {
      return;
    }

    bulkMarkDepositConfirmedMutation.mutate(selectedContractIds);
  };

  const handleRefundSubmit = () => {
    const normalizedRefundAmount = toNonNegativeWholeAmount(refundAmount);
    if (!refundContractId || normalizedRefundAmount <= 0) {
      toast({ title: "환불 금액을 입력해주세요.", variant: "destructive" });
      return;
    }
    const contract = contracts.find(c => c.id === refundContractId);
    if (!contract) {
      toast({ title: "선택한 계약을 찾을 수 없습니다.", variant: "destructive" });
      return;
    }
    if (normalizedRefundAmount > refundTargetAmount) {
      toast({ title: "환불 금액은 선택 항목 금액을 초과할 수 없습니다.", variant: "destructive" });
      return;
    }
    const remainingCost = refundTargetAmount - totalRefunded;
    if (normalizedRefundAmount > remainingCost) {
      toast({ title: "환불 금액은 잔여 선택 항목 금액을 초과할 수 없습니다.", variant: "destructive" });
      return;
    }
    refundMutation.mutate({
      contractId: refundContractId,
      itemId: refundTargetItem?.id || null,
      userIdentifier: refundTargetItem?.userIdentifier || contract.userIdentifier || null,
      productName: refundTargetItem?.productName || contract.products || null,
      days: refundTargetItem ? getEffectiveDays(refundTargetItem) : Number(contract.days) || 0,
      addQuantity: refundTargetItem?.addQuantity || 0,
      extendQuantity: refundTargetItem?.extendQuantity || 0,
      targetAmount: refundTargetAmount,
      amount: normalizedRefundAmount,
      quantity: refundQuantity,
      refundDays: refundDays,
      account: refundAccount,
      slot: refundSlot,
      worker: refundWorker,
      reason: refundReason,
      refundDate,
      createdBy: currentUser?.name || "",
    });
  };

  const workCostOverrideRow = useMemo(() => {
    if (!workCostOverrideContractId || !workCostOverrideItemId) return null;
    return contractRows.find((row) =>
      row.contract.id === workCostOverrideContractId && String(row.item.id) === String(workCostOverrideItemId),
    ) || null;
  }, [contractRows, workCostOverrideContractId, workCostOverrideItemId]);
  const workCostOverrideFormItem = useMemo(() => {
    if (!workCostOverrideFormItemId) return null;
    return productItems.find((item) => String(item.id) === String(workCostOverrideFormItemId)) || null;
  }, [productItems, workCostOverrideFormItemId]);
  const workCostOverrideTargetItem = workCostOverrideFormItem ?? workCostOverrideRow?.item ?? null;

  const resetWorkCostOverrideDialog = () => {
    setIsWorkCostOverrideOpen(false);
    setWorkCostOverrideContractId(null);
    setWorkCostOverrideItemId(null);
    setWorkCostOverrideFormItemId(null);
    setOverrideWorker("");
    setOverrideWorkCostAmount(0);
  };

  const handleDeleteSelected = () => {
    selectedContractIds.forEach((id) => deleteMutation.mutate(id));
    setSelectedItems([]);
    setSelectedRowMap({});
  };

  const handleWorkCostOverrideOpen = () => {
    if (!singleSelectedRow) {
      toast({ title: "작업비를 지정할 항목을 하나만 선택해주세요.", variant: "destructive" });
      return;
    }
    const { contract, item } = singleSelectedRow;
    setWorkCostOverrideContractId(contract.id);
    setWorkCostOverrideItemId(String(item.id));
    setWorkCostOverrideFormItemId(null);
    setOverrideWorker(item.worker || contract.worker || "");
    setOverrideWorkCostAmount(calculateWorkCost(item));
    setIsWorkCostOverrideOpen(true);
  };

  const handleFormWorkCostOverrideOpen = (item: ProductItem) => {
    setWorkCostOverrideContractId(null);
    setWorkCostOverrideItemId(null);
    setWorkCostOverrideFormItemId(String(item.id));
    setOverrideWorker(item.worker || "");
    setOverrideWorkCostAmount(calculateWorkCost(item));
    setIsWorkCostOverrideOpen(true);
  };

  const handleWorkCostOverrideSubmit = () => {
    if (workCostOverrideFormItem) {
      const nextWorkCostAmount = toNonNegativeAmount(overrideWorkCostAmount);
      const nextWorker = overrideWorker.trim();
      const nextMarginAmount = calculateMarginAmountWithWorkCost(workCostOverrideFormItem, nextWorkCostAmount);
      updateProductItem(workCostOverrideFormItem.id, {
        worker: nextWorker,
        fixedWorkCostAmount: nextWorkCostAmount,
        marginAmount: nextMarginAmount,
      });
      resetWorkCostOverrideDialog();
      toast({ title: "작업비 수정이 반영되었습니다." });
      return;
    }
    if (!workCostOverrideRow) {
      toast({ title: "선택한 계약 항목을 찾을 수 없습니다.", variant: "destructive" });
      return;
    }
    const nextWorkCostAmount = toNonNegativeAmount(overrideWorkCostAmount);
    const nextWorker = overrideWorker.trim();
    const targetContract = workCostOverrideRow.contract;
    const updatedItems = getContractDisplayItems(targetContract).map((item) => {
      if (String(item.id) !== String(workCostOverrideRow.item.id)) {
        return item;
      }
      const nextMarginAmount = calculateMarginAmountWithWorkCost(item, nextWorkCostAmount);
      return {
        ...item,
        worker: nextWorker,
        fixedWorkCostAmount: nextWorkCostAmount,
        marginAmount: nextMarginAmount,
      };
    });
    overrideWorkCostMutation.mutate({
      id: targetContract.id,
      data: buildContractPayloadFromItems(targetContract, updatedItems),
    });
  };

  const stopSelectionEventPropagation = (event: SyntheticEvent) => {
    event.stopPropagation();
  };

  const toggleSelectAll = (checked?: boolean | "indeterminate") => {
    const visibleRowKeySet = new Set(allVisibleRowKeys);
    const shouldSelect = checked === undefined ? !isAllVisibleRowsSelected : checked !== false;
    if (!shouldSelect) {
      setSelectedItems((prev) => prev.filter((key) => !visibleRowKeySet.has(key)));
    } else {
      setSelectedItems((prev) => Array.from(new Set([...prev, ...allVisibleRowKeys])));
    }
  };

  const toggleSelectItem = (rowKey: string, checked?: boolean | "indeterminate") => {
    setSelectedItems((prev) => {
      const shouldSelect = checked === undefined ? !prev.includes(rowKey) : checked !== false;
      if (shouldSelect) {
        return prev.includes(rowKey) ? prev : [...prev, rowKey];
      }
      return prev.filter((i) => i !== rowKey);
    });
  };

  const formatCurrency = (value: number) => {
    return formatCeilAmount(Number.isFinite(value) ? value : 0);
  };

  function normalizeText(value: string | null | undefined) {
    return (value ?? "").toString().trim();
  }

  function normalizeCategoryLabel(value: string | null | undefined) {
    const text = normalizeText(value);
    const compact = text.replace(/\s+/g, "");
    if (!compact) return "";
    if (text === "?????" || compact === "바이럴상품") return "바이럴상품";
    return text;
  }

  function canonicalPaymentMethod(value: string | null | undefined) {
    const raw = normalizeText(value);
    const normalized = raw.replace(/\s+/g, "");
    const asciiKey = normalized.replace(/[_-]/g, "").toLowerCase();
    if (!normalized) return "";
    if (
      ["입금 전", "입금전"].includes(raw) ||
      ["beforedeposit", "pendingdeposit", "beforepayment", "unpaid"].includes(asciiKey)
    ) {
      return "입금 전";
    }
    if (
      ["입금확인", "입금완료", "하나", "국민", "농협", "하나은행", "국민은행", "농협은행"].includes(raw) ||
      ["deposit", "deposited", "banktransfer", "transfer", "confirmed", "hana", "hanabank", "kb", "kookmin", "kbstar", "nonghyup", "nh"].includes(asciiKey)
    ) {
      return "입금확인";
    }
    if (["환불요청", "환불처리", "환불등록"].includes(raw) || ["refund", "refunded", "refundrequest", "refundrequested"].includes(asciiKey)) {
      return "환불요청";
    }
    if (
      ["적립금사용", "적립금 사용", "적립금", "적립", "적립금등록"].includes(raw) ||
      ["usekeep", "usecredit", "credituse", "keepuse", "keep", "credit", "reserve", "savedcredit"].includes(asciiKey) ||
      /^\?+$/.test(normalized)
    ) {
      return "적립금사용";
    }
    if (["체크", "기타"].includes(raw) || ["check", "other", "etc"].includes(asciiKey)) {
      return "기타";
    }
    if (/^[a-z0-9 _-]+$/i.test(raw)) return "";
    return raw;
  }

  function getPaymentMethodDisplayLabel(value: string | null | undefined) {
    return canonicalPaymentMethod(value);
  }

  function getDepositBankDisplayLabel(contract: Contract) {
    return normalizeDepositBankForForm(
      (contract as Contract & { depositBank?: string | null }).depositBank,
      contract.paymentMethod,
    );
  }

  const getContractBaseAmount = (contract: Contract) => {
    const contractItems = getContractDisplayItems(contract).filter((item) => String(item.productName || "").trim());
    if (contractItems.length > 0) {
      return Math.max(0, contractItems.reduce((sum, item) => sum + calculateSupplyAmount(item), 0));
    }

    const contractCost = Math.max(0, Number(contract.cost) || 0);
    if (contractCost > 0) {
      return contractCost;
    }

    const quantity = getContractQuantity(contract);

    const productNames = String(contract.products || "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);

    if (productNames.length === 0) return 0;

    const base = productNames.reduce((sum, name) => {
      const snapshot = resolveProductSnapshotAtDate(name, contract.contractDate);
      const unitPrice = Math.max(0, Number(snapshot?.unitPrice) || 0);
      return sum + unitPrice * quantity;
    }, 0);

    return Math.max(0, base);
  };

  const getContractQuantity = (contract: Contract) => {
    const addQuantity = Math.max(0, Number(contract.addQuantity) || 0);
    const extendQuantity = Math.max(0, Number(contract.extendQuantity) || 0);
    return addQuantity + extendQuantity > 0
      ? addQuantity + extendQuantity
      : Math.max(0, Number(contract.quantity) || 0);
  };

  const getContractWorkCost = (contract: Contract) => {
    const contractItems = getContractDisplayItems(contract).filter((item) => String(item.productName || "").trim());
    if (contractItems.length > 0) {
      const storedWorkCost = contractItems.reduce((sum, item) => sum + calculateWorkCost(item, contract.paymentMethod), 0);
      if (storedWorkCost > 0) return storedWorkCost;
    }

    const quantity = getContractQuantity(contract);
    const days = Math.max(1, Number(contract.days) || 1);
    const productNames = String(contract.products || "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);

    if (productNames.length > 0) {
      const computed = productNames.reduce((sum, name) => {
        const snapshot = resolveProductSnapshotAtDate(name, contract.contractDate);
        const workerUnitCost = Math.max(0, Number(snapshot?.workCost) || 0);
        if (workerUnitCost <= 0) return sum;
        const workerBaseDays = Math.max(1, Number(snapshot?.baseDays) || 0, 1);
        return sum + ((workerUnitCost / workerBaseDays) * days * quantity);
      }, 0);
      if (computed > 0) return computed;
    }

    return Math.max(0, Number(contract.workCost) || 0);
  };

  const getContractVatAmount = (contract: Contract) => {
    const contractItems = getContractDisplayItems(contract).filter((item) => String(item.productName || "").trim());
    if (contractItems.length > 0) {
      return Math.max(0, contractItems.reduce((sum, item) => sum + calculateVat(item), 0));
    }

    const issued = parseInvoiceIssued(contract.invoiceIssued);
    if (issued !== true) return 0;

    const contractCost = Math.max(0, Number(contract.cost) || 0);
    if (contractCost > 0) {
      const baseAmount = getContractBaseAmount(contract);
      return Math.max(0, contractCost - baseAmount);
    }

    const baseAmount = getContractBaseAmount(contract);
    return Math.max(0, baseAmount * 0.1);
  };

  const getContractSupplyAmount = (contract: Contract) => {
    return Math.max(0, getContractBaseAmount(contract));
  };

  const getVatDisplayText = (contract: Contract, item?: ProductItem) => {
    if (item && String(item.vatType || "").trim()) {
      return normalizeVatType(item.vatType) === "포함" ? "포함" : "미포함";
    }
    const issued = parseInvoiceIssued(contract.invoiceIssued);
    if (issued === null) {
      return "-";
    }
    return issued ? "포함" : "미포함";
  };

  const getItemVatDisplayText = (item: ProductItem) => {
    return normalizeVatType(item.vatType) === "포함" ? "포함" : "미포함";
  };

  const getItemTotalAmount = (item: ProductItem) => {
    return calculateSupplyAmount(item);
  };

  const getItemRefundAmount = (item: ProductItem) => {
    const storedRefundAmount = Number(item.refundAmount);
    if (Number.isFinite(storedRefundAmount) && storedRefundAmount > 0) {
      return storedRefundAmount;
    }
    return 0;
  };

  const getItemKeepAmount = (contract: Contract, item: ProductItem) => {
    const storedKeepAmount = Math.abs(Number(item.negativeAdjustmentAmount) || 0);
    if (Number.isFinite(storedKeepAmount) && storedKeepAmount > 0) {
      return getFinancialAmountWithVat(contract, {
        amount: storedKeepAmount,
        targetAmount: calculateSupplyAmount(item),
        itemId: item.id,
        userIdentifier: item.userIdentifier,
        productName: item.productName,
      });
    }
    return 0;
  };

  const getItemKeepFallbackGrossAmount = (contract: Contract, item: ProductItem) => {
    return getFinancialTargetGrossAmount(contract, {
      targetAmount: calculateSupplyAmount(item),
      itemId: item.id,
      userIdentifier: item.userIdentifier,
      productName: item.productName,
    });
  };

  const getPaymentMethodDisplayAmount = (contract: Contract, item: ProductItem) => {
    const itemKey = getFinancialItemKey(contract.id, item.id);
    const fallbackKey = getFinancialFallbackKey(contract.id, item.userIdentifier, item.productName);
    const displayItems = getContractDisplayItems(contract).filter((entry) => String(entry.productName || "").trim());
    const useContractFallback = displayItems.length <= 1;
    return Math.max(
      refundAmountByItemKey.get(itemKey) || 0,
      refundAmountByFallbackKey.get(fallbackKey) || 0,
      useContractFallback ? (refundAmountByContractId.get(String(contract.id || "").trim()) || 0) : 0,
      getItemRefundAmount(item),
    );
  };

  const getItemOriginalAmount = (item: ProductItem) => {
    return Math.max(0, getItemTotalAmount(item) + getItemRefundAmount(item));
  };

  const calculateMarginAmountWithWorkCost = (item: ProductItem, workCostAmount = calculateWorkCost(item)) => {
    return getItemTotalAmount(item) - workCostAmount;
  };

  const calculateMarginRateFromMarginAmount = (item: ProductItem, marginAmount = getItemMargin(item)) => {
    const baseAmount = getItemOriginalAmount(item) || getItemTotalAmount(item);
    if (baseAmount <= 0) return 0;
    return (marginAmount / baseAmount) * 100;
  };

  const getItemMargin = (item: ProductItem) => {
    if (item.marginAmount !== null && item.marginAmount !== undefined) {
      const storedMarginAmount = Number(item.marginAmount);
      if (Number.isFinite(storedMarginAmount)) {
        return storedMarginAmount;
      }
    }
    return calculateMarginAmountWithWorkCost(item);
  };

  const renderContractTotalsSummary = () => {
    const summaryItems = [
      { label: "일수", value: String(totalDays) },
      { label: "수량", value: String(totalQuantity) },
      { label: "작업비", value: formatCurrency(totalWorkCost) },
      { label: "공급가", value: formatCurrency(totalSupplyAmount) },
      { label: "부가세", value: formatCurrency(totalVat) },
      { label: "금액", value: formatCurrency(totalAmount), valueClassName: "text-primary" },
      { label: "마진", value: formatCurrency(totalMargin) },
      { label: "마진율", value: formatPercent(totalMarginRate) },
    ];

    return (
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-right">
        {summaryItems.map((summary) => (
          <div
            key={summary.label}
            className="flex min-w-0 items-center gap-1.5 whitespace-nowrap"
          >
            <span className="text-xs text-muted-foreground">{summary.label}</span>
            <span className={`text-sm font-semibold tabular-nums ${summary.valueClassName || ""}`}>
              {summary.value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const shouldScrollProductItems = productItems.length > 5;
  const productRowsViewportClassName = shouldScrollProductItems ? "max-h-[292px] overflow-y-auto" : "";
  const contractDialogClassName = "top-[70px] max-h-[calc(100vh-140px)] translate-y-0 gap-3 overflow-hidden rounded-none p-4 sm:rounded-none";
  const contractDialogBodyClassName = "flex min-h-0 flex-col gap-3 overflow-y-auto pr-1";

  const getItemMarginRate = (item: ProductItem) => {
    return calculateMarginRateFromMarginAmount(item);
  };

  const totalMargin = productItems.reduce((sum, item) => sum + getItemMargin(item), 0);
  const totalMarginRate = totalSupplyAmount > 0 ? (totalMargin / totalSupplyAmount) * 100 : 0;
  const selectedSummary = useMemo(() => {
    const cost = selectedRows.reduce((sum, row) => sum + getItemTotalAmount(row.item), 0);
    const workCost = selectedRows.reduce((sum, row) => sum + calculateWorkCost(row.item), 0);
    const margin = selectedRows.reduce((sum, row) => sum + getItemMargin(row.item), 0);
    const marginRate = cost > 0 ? (margin / cost) * 100 : 0;

    return {
      rowCount: selectedRows.length,
      contractCount: selectedContractIds.length,
      cost,
      workCost,
      margin,
      marginRate,
    };
  }, [selectedRows, selectedContractIds]);

  const getContractMargin = (contract: Contract) => {
    const cost = getContractSupplyAmount(contract);
    const workCost = getContractWorkCost(contract);
    return cost - workCost;
  };

  const getContractMarginRate = (contract: Contract) => {
    const cost = getContractSupplyAmount(contract);
    if (cost <= 0) return 0;
    return (getContractMargin(contract) / cost) * 100;
  };

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  const getPaymentMethodTextClassName = (paymentMethod: string | null | undefined) => {
    const normalized = canonicalPaymentMethod(paymentMethod);
    if (normalized === "환불요청") return "text-red-600 font-medium";
    if (normalized === "적립금사용") return "text-green-600 font-medium";
    if (normalized === "입금확인") return "text-blue-600 font-medium";
    if (normalized === "입금 전") return "text-amber-600 font-medium";
    return "text-foreground";
  };

  const productNameOptions = useMemo(() => {
    return Array.from(
      new Set(
        products
          .map((product) => normalizeText(product.name))
          .filter(Boolean),
      ),
    );
  }, [products]);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold" data-testid="text-page-title">계약관리목록</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            검색 결과 {totalFilteredContracts} 건
          </span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="계약번호, 고객명, 상품명, 아이디 검색"
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
            className="rounded-none"
            onClick={() => {
              if (selectedContractIds.length === 0) {
                toast({ title: "삭제할 항목을 선택해주세요.", variant: "destructive" });
                return;
              }
                if (confirm(`선택한 ${selectedContractIds.length}개 계약을 삭제하시겠습니까?`)) {
                  selectedContractIds.forEach((id) => deleteMutation.mutate(id));
                  setSelectedItems([]);
                  setSelectedRowMap({});
                }
              }}
            disabled={selectedContractIds.length === 0}
            data-testid="button-delete"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            삭제
          </Button>
          <Button
            variant="outline"
            className="rounded-none"
            onClick={handleCopyToCreateDialog}
            disabled={selectedContractIds.length === 0}
            data-testid="button-copy"
          >
            <Copy className="w-4 h-4 mr-1" />
            복사
          </Button>
          <Button
            variant="outline"
            className="rounded-none"
            onClick={handleRefundOpen}
            disabled={!singleSelectedRow}
            data-testid="button-refund"
          >
            <Undo2 className="w-4 h-4 mr-1" />
            환불
          </Button>
          <Button
            variant="outline"
            className="rounded-none"
            onClick={handleBulkMarkDepositConfirmed}
            disabled={selectedContractIds.length === 0 || bulkMarkDepositConfirmedMutation.isPending}
            data-testid="button-bulk-mark-deposit-confirmed"
          >
            {bulkMarkDepositConfirmedMutation.isPending ? "변경 중..." : "입금확인 변경"}
          </Button>
          <Button
            className="rounded-none bg-primary hover:bg-primary/90"
            onClick={handleOpenCreateDialog}
            data-testid="button-create"
          >
            등록
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={handleCreateDialogOpenChange}>
            <DialogContent
              key={`create-contract-dialog-${createDialogMode}-${createDialogRenderKey}`}
              className={contractDialogClassName}
              style={{ width: "calc(100vw - 88px)", maxWidth: "1700px" }}
            >
              <DialogHeader className="space-y-1 border-b pb-3">
                <DialogTitle>{createDialogMode === "copy" ? "계약 복사 등록" : "계약 등록"}</DialogTitle>
              </DialogHeader>
              <div className={contractDialogBodyClassName}>
                <div className="grid gap-3 lg:max-w-[760px] lg:grid-cols-[180px_280px_220px] lg:items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">계약일</Label>
                    <Input
                      type="date"
                      value={formData.contractDate ? getKoreanDateKey(formData.contractDate) : ""}
                      onChange={(e) => setFormData({ ...formData, contractDate: parseKoreanDateInput(e.target.value, formData.contractDate as Date || getKoreanNow()) })}
                      className="h-8 rounded-none text-sm"
                      data-testid="input-contract-date"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">고객명 *</Label>
                    <AutocompleteInput
                      value={formData.customerName || ""}
                      onChange={(value) => {
                        const selectedCustomer = customers.find(c => c.name === value);
                        setFormData({
                          ...formData,
                          customerId: selectedCustomer?.id || undefined,
                          customerName: value,
                          contractNumber: selectedCustomer?.email || formData.contractNumber || "",
                        });
                      }}
                      options={customers.map(c => c.name).filter(Boolean)}
                      placeholder="고객명 검색"
                      className="h-8 rounded-none text-sm"
                      testId="select-customer"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">담당자</Label>
                    <Select
                      value={formData.managerName || ""}
                      onValueChange={handleManagerChange}
                    >
                      <SelectTrigger className="h-8 rounded-none text-sm" data-testid="input-manager">
                        <SelectValue placeholder="담당자 선택" />
                      </SelectTrigger>
                      <SelectContent className="rounded-none">
                        {users.filter((user) => user.name).map((user) => (
                          <SelectItem key={user.id} value={user.name}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* 상품 정보 */}
                <div className="flex min-h-0 flex-col gap-1">
                  <Label className="text-sm font-medium">상품 정보</Label>
                  <div className="overflow-x-auto rounded-none border bg-white">
                    <div className={productRowsViewportClassName}>
                    <Table className="table-fixed w-full min-w-[1360px]">
                      <TableHeader className="sticky top-0 z-10 bg-white">
                        <TableRow className="bg-muted/30">
                          <TableHead className="w-6 px-1"></TableHead>
                          <TableHead className="px-1 py-1 text-left text-xs font-medium" style={{ width: "165px" }}>상품명</TableHead>
                          <TableHead className="px-1 py-1 text-left text-xs font-medium" style={{ width: "130px" }}>사용자ID</TableHead>
                          <TableHead className="px-1 py-1 text-left text-xs font-medium" style={{ width: "82px" }}>단가</TableHead>
                          <TableHead className="px-1 py-1 text-left text-xs font-medium" style={{ width: "58px" }}>일수</TableHead>
                          <TableHead className="px-1 py-1 text-left text-xs font-medium" style={{ width: "58px" }}>추가</TableHead>
                          <TableHead className="px-1 py-1 text-left text-xs font-medium" style={{ width: "58px" }}>연장</TableHead>
                          <TableHead className="px-1 py-1 text-left text-xs font-medium" style={{ width: "88px" }}>작업비</TableHead>
                          <TableHead className="px-1 py-1 text-left text-xs font-medium" style={{ width: "86px" }}>작업자</TableHead>
                          <TableHead className="px-1 py-1 text-left text-xs font-medium" style={{ width: "72px" }}>수정</TableHead>
                          <TableHead className="px-1 py-1 text-left text-xs font-medium" style={{ width: "88px" }}>공급가액</TableHead>
                          <TableHead className="px-1 py-1 text-left text-xs font-medium" style={{ width: "76px" }}>부가세</TableHead>
                          <TableHead className="px-1 py-1 text-left text-xs font-medium" style={{ width: "84px" }}>마진</TableHead>
                          <TableHead className="px-1 py-1 text-left text-xs font-medium" style={{ width: "74px" }}>마진율</TableHead>
                          <TableHead className="px-1 py-1 text-left text-xs font-medium" style={{ width: "92px" }}>부가세구분</TableHead>
                          <TableHead className="w-8 px-1"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {productItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="px-1 py-1.5">
                              <GripVertical className="w-4 h-4 text-muted-foreground" />
                            </TableCell>
                            <TableCell className="px-1 py-1.5">
                              <AutocompleteInput
                                value={item.productName}
                                onChange={(value) => updateProductItem(item.id, "productName", value)}
                                options={productNameOptions}
                                placeholder="상품명 검색"
                                className="rounded-none h-8 w-full text-sm"
                                testId={`select-product-${item.id}`}
                              />
                            </TableCell>
                            <TableCell className="px-1 py-1.5">
                              <Input
                                value={item.userIdentifier}
                                onChange={(e) => updateProductItem(item.id, "userIdentifier", e.target.value)}
                                className="rounded-none h-8 w-full text-left"
                                placeholder="사용자ID 입력"
                                data-testid={`input-user-id-${item.id}`}
                              />
                            </TableCell>
                            <TableCell className="px-1 py-1.5">
                                <Input
                                  type="number"
                                  value={getProductItemNumericInputValue(item, "unitPrice")}
                                  onChange={(e) => handleProductItemNumericInputChange(item, "unitPrice", e.target.value)}
                                  onBlur={() => handleProductItemNumericInputBlur(item, "unitPrice", 0)}
                                  className="rounded-none h-8 w-full text-left"
                                  data-testid={`input-unitPrice-${item.id}`}
                                />
                            </TableCell>
                            <TableCell className="px-1 py-1.5">
                                <Input
                                  type="number"
                                  value={isViralItem(item) ? 1 : getProductItemNumericInputValue(item, "days")}
                                  onChange={(e) => handleProductItemNumericInputChange(item, "days", e.target.value)}
                                  onBlur={() => handleProductItemNumericInputBlur(item, "days", 1)}
                                  className={`rounded-none h-8 w-full text-left ${isViralItem(item) ? "bg-muted" : ""}`}
                                  min="1"
                                  disabled={isViralItem(item)}
                                data-testid={`input-days-${item.id}`}
                              />
                            </TableCell>
                            <TableCell className="px-1 py-1.5">
                                <Input
                                  type="number"
                                  value={getProductItemNumericInputValue(item, "addQuantity")}
                                  onChange={(e) => handleProductItemNumericInputChange(item, "addQuantity", e.target.value)}
                                  onBlur={() => handleProductItemNumericInputBlur(item, "addQuantity", 0)}
                                  className="rounded-none h-8 w-full text-left"
                                  min="0"
                                  data-testid={`input-add-quantity-${item.id}`}
                              />
                            </TableCell>
                            <TableCell className="px-1 py-1.5">
                                <Input
                                  type="number"
                                  value={getProductItemNumericInputValue(item, "extendQuantity")}
                                  onChange={(e) => handleProductItemNumericInputChange(item, "extendQuantity", e.target.value)}
                                  onBlur={() => handleProductItemNumericInputBlur(item, "extendQuantity", 0)}
                                  className="rounded-none h-8 w-full text-left"
                                  min="0"
                                  data-testid={`input-extend-quantity-${item.id}`}
                              />
                            </TableCell>
                            <TableCell className="px-1 py-1.5 align-middle">
                              <span className="flex h-8 items-center justify-end text-sm tabular-nums">
                                {formatCurrency(calculateWorkCost(item))}
                              </span>
                            </TableCell>
                            <TableCell className="px-1 py-1.5 align-middle">
                              <span className="flex h-8 items-center text-sm text-muted-foreground">
                                {item.worker || "-"}
                              </span>
                            </TableCell>
                            <TableCell className="px-1 py-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-none h-8 w-full px-2 text-xs"
                                onClick={() => handleFormWorkCostOverrideOpen(item)}
                                data-testid={`button-work-cost-override-create-${item.id}`}
                              >
                                수정
                              </Button>
                            </TableCell>
                            <TableCell className="px-1 py-1.5 align-middle">
                              <span className="flex h-8 items-center justify-end text-sm tabular-nums">
                                {formatCurrency(calculateSupplyAmount(item))}
                              </span>
                            </TableCell>
                            <TableCell className="px-1 py-1.5 align-middle">
                              <span className="flex h-8 items-center justify-end text-sm tabular-nums">
                                {formatCurrency(calculateVat(item))}
                              </span>
                            </TableCell>
                            <TableCell className="px-1 py-1.5 align-middle">
                              <span className="flex h-8 items-center justify-end text-sm tabular-nums">
                                {formatCurrency(getItemMargin(item))}
                              </span>
                            </TableCell>
                            <TableCell className="px-1 py-1.5 align-middle">
                              <span className="flex h-8 items-center justify-end text-sm tabular-nums">
                                {formatPercent(getItemMarginRate(item))}
                              </span>
                            </TableCell>
                            <TableCell className="px-1 py-1.5">
                              <Select
                                value={item.vatType}
                                onValueChange={(value) => updateProductItem(item.id, "vatType", value)}
                              >
                                <SelectTrigger className="rounded-none h-8 w-full" data-testid={`select-vatType-${item.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-none">
                                  <SelectItem value="포함">포함</SelectItem>
                                  <SelectItem value="미포함">미포함</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="px-1 py-1.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-none"
                                onClick={() => removeProductItem(item.id)}
                                disabled={productItems.length === 1}
                                data-testid={`button-remove-${item.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                    
                    <div className="border-t px-2 py-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-none gap-1 px-1.5 text-xs text-muted-foreground"
                        onClick={addProductItem}
                        data-testid="button-add-product-item"
                      >
                        <Plus className="w-4 h-4" />
                        새 항목 추가
                      </Button>
                    </div>

                    <div className="border-t px-2 py-1.5">
                      {renderContractTotalsSummary()}
                    </div>
                  </div>
                </div>

                <div className="w-full">
                  <div className="flex max-w-[820px] flex-col items-start gap-2">
                    <div className="grid w-full gap-2 md:grid-cols-[180px_180px_180px]">
                      <div className="space-y-1">
                        <Label className="text-xs">결제확인</Label>
                        <Select
                          value={formData.paymentMethod || ""}
                          onValueChange={(value) => setFormData({ ...formData, paymentMethod: value })}
                        >
                          <SelectTrigger className="h-8 rounded-none text-sm" data-testid="select-payment-method">
                            <SelectValue placeholder="선택" />
                          </SelectTrigger>
                          <SelectContent className="rounded-none">
                            {CONTRACT_PAYMENT_METHOD_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">입금통장</Label>
                        <Select
                          value={formData.depositBank || DEFAULT_CREATE_DEPOSIT_BANK}
                          onValueChange={(value) => setFormData({ ...formData, depositBank: value })}
                        >
                          <SelectTrigger className="h-8 rounded-none text-sm" data-testid="select-deposit-bank">
                            <SelectValue placeholder="선택" />
                          </SelectTrigger>
                          <SelectContent className="rounded-none">
                            {CONTRACT_DEPOSIT_BANK_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">지급현황</Label>
                        <Select
                          value={formData.disbursementStatus || ""}
                          onValueChange={(value) => setFormData({ ...formData, disbursementStatus: value })}
                        >
                          <SelectTrigger className="h-8 rounded-none text-sm" data-testid="select-disbursement-status">
                            <SelectValue placeholder="선택" />
                          </SelectTrigger>
                          <SelectContent className="rounded-none">
                            <SelectItem value="지급예정">지급예정</SelectItem>
                            <SelectItem value="지급대기">지급대기</SelectItem>
                            <SelectItem value="지급요청">지급요청</SelectItem>
                            <SelectItem value="지급완료">지급완료</SelectItem>
                            <SelectItem value="일반지급">일반지급</SelectItem>
                            <SelectItem value="지급보류">지급보류</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="w-full max-w-[320px] space-y-1">
                      <Label className="text-xs">비고</Label>
                      <Textarea
                        rows={3}
                        value={formData.notes || ""}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="min-h-[78px] rounded-none text-sm resize-none"
                        placeholder="비고 입력"
                        data-testid="input-notes"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex w-full justify-end gap-2 border-t pt-3">
                  <Button
                    variant="outline"
                    onClick={closeCreateDialog}
                    className="h-8 rounded-none px-3 text-sm"
                    data-testid="button-cancel"
                  >
                    취소
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={createMutation.isPending}
                    className="h-8 rounded-none px-3 text-sm"
                    data-testid="button-submit"
                  >
                    {createMutation.isPending ? "등록 중..." : "등록"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Edit Dialog */}
          <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setEditingContractId(null); setEditDialogMode("edit"); resetForm(); } }}>
            <DialogContent
              className={contractDialogClassName}
              style={{ width: "calc(100vw - 88px)", maxWidth: "1700px" }}
            >
              <DialogHeader className="space-y-1 border-b pb-3">
                <DialogTitle>{isEditReadOnly ? "계약 상세" : "계약 수정"}</DialogTitle>
              </DialogHeader>
              <div className={contractDialogBodyClassName}>
                <div className="grid gap-3 lg:max-w-[760px] lg:grid-cols-[180px_280px_220px] lg:items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">계약일</Label>
                    <Input
                      type="date"
                      value={formData.contractDate ? getKoreanDateKey(formData.contractDate) : ""}
                      onChange={(e) => setFormData({ ...formData, contractDate: parseKoreanDateInput(e.target.value, formData.contractDate as Date || getKoreanNow()) })}
                      className="h-8 rounded-none text-sm"
                      data-testid="edit-input-contract-date"
                      disabled={isEditReadOnly}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">고객명</Label>
                    <AutocompleteInput
                      value={formData.customerName || ""}
                      onChange={(value) => {
                        const selectedCustomer = customers.find(c => c.name === value);
                        setFormData({
                          ...formData,
                          customerId: selectedCustomer?.id || undefined,
                          customerName: value,
                          contractNumber: selectedCustomer?.email || formData.contractNumber || "",
                        });
                      }}
                      options={customers.map(c => c.name)}
                      placeholder="고객명 검색"
                      className="h-8 rounded-none text-sm"
                      testId="edit-select-customer"
                      disabled={isEditReadOnly}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">담당자</Label>
                    <Select
                      value={formData.managerName}
                      onValueChange={handleManagerChange}
                      disabled={isEditReadOnly}
                    >
                      <SelectTrigger className="h-8 rounded-none text-sm" data-testid="edit-select-manager">
                        <SelectValue placeholder="담당자 선택" />
                      </SelectTrigger>
                      <SelectContent className="rounded-none">
                        {users.filter(u => u.name).map((user) => (
                          <SelectItem key={user.id} value={user.name}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex min-h-0 flex-col gap-1">
                  <Label className="text-sm font-medium">상품 정보</Label>
                <div className="overflow-x-auto rounded-none border bg-white">
                    <div className={productRowsViewportClassName}>
                    <table className="w-full min-w-[1360px] table-fixed">
                      <thead className="sticky top-0 z-10 bg-muted/30">
                        <tr>
                          <th className="px-1.5 py-1.5 text-left text-xs font-medium w-12"></th>
                          <th className="px-1 py-1 text-left text-xs font-medium w-[165px]">상품명</th>
                          <th className="px-1 py-1 text-left text-xs font-medium w-[130px]">사용자ID</th>
                          <th className="px-1 py-1 text-right text-xs font-medium w-[82px]">단가</th>
                          <th className="px-1 py-1 text-right text-xs font-medium w-[58px]">일수</th>
                          <th className="px-1 py-1 text-right text-xs font-medium w-[58px]">추가</th>
                          <th className="px-1 py-1 text-right text-xs font-medium w-[58px]">연장</th>
                          <th className="px-1 py-1 text-right text-xs font-medium w-[88px]">작업비</th>
                          <th className="px-1 py-1 text-left text-xs font-medium w-[86px]">작업자</th>
                          <th className="px-1 py-1 text-center text-xs font-medium w-[72px]">수정</th>
                          <th className="px-1 py-1 text-right text-xs font-medium w-[88px]">공급가액</th>
                          <th className="px-1 py-1 text-right text-xs font-medium w-[76px]">부가세</th>
                          <th className="px-1 py-1 text-right text-xs font-medium w-[84px]">마진</th>
                          <th className="px-1 py-1 text-right text-xs font-medium w-[74px]">마진율</th>
                          <th className="px-1 py-1 text-left text-xs font-medium w-[92px]">부가세구분</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productItems.map((item, index) => (
                          <tr key={item.id} className="border-t">
                            <td className="p-1.5">
                              {productItems.length > 1 && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="rounded-none h-6 w-6"
                                  onClick={() => removeProductItem(item.id)}
                                  disabled={isEditReadOnly}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </td>
                            <td className="p-1.5">
                              <AutocompleteInput
                                value={item.productName}
                                onChange={(value) => {
                                  updateProductItem(item.id, { productName: value });
                                }}
                                options={productNameOptions}
                                placeholder="상품명 검색"
                                className="rounded-none h-8 text-sm"
                                testId={`edit-select-product-${index}`}
                                disabled={isEditReadOnly}
                              />
                            </td>
                            <td className="p-1.5">
                              <Input
                                value={item.userIdentifier}
                                onChange={(e) => updateProductItem(item.id, { userIdentifier: e.target.value })}
                                className="rounded-none h-8 text-sm"
                                placeholder="사용자ID 입력"
                                data-testid={`edit-input-user-id-${index}`}
                                disabled={isEditReadOnly}
                              />
                            </td>
                            <td className="p-1.5 text-right">
                              <Input
                                type="number"
                                value={getProductItemNumericInputValue(item, "unitPrice")}
                                onChange={(e) => handleProductItemNumericInputChange(item, "unitPrice", e.target.value)}
                                onBlur={() => handleProductItemNumericInputBlur(item, "unitPrice", 0)}
                                className="rounded-none h-8 text-right text-sm"
                                data-testid={`edit-input-unit-price-${index}`}
                                disabled={isEditReadOnly}
                              />
                            </td>
                            <td className="p-1.5 text-right">
                              <Input
                                type="number"
                                value={isViralItem(item) ? 1 : getProductItemNumericInputValue(item, "days")}
                                onChange={(e) => handleProductItemNumericInputChange(item, "days", e.target.value)}
                                onBlur={() => handleProductItemNumericInputBlur(item, "days", 1)}
                                className={`rounded-none h-8 text-right text-sm w-16 ${isViralItem(item) ? "bg-muted" : ""}`}
                                min="1"
                                data-testid={`edit-input-days-${index}`}
                                disabled={isEditReadOnly || isViralItem(item)}
                              />
                            </td>
                            <td className="p-1.5 text-right">
                              <Input
                                type="number"
                                value={getProductItemNumericInputValue(item, "addQuantity")}
                                onChange={(e) => handleProductItemNumericInputChange(item, "addQuantity", e.target.value)}
                                onBlur={() => handleProductItemNumericInputBlur(item, "addQuantity", 0)}
                                className="rounded-none h-8 text-right text-sm w-16"
                                min="0"
                                data-testid={`edit-input-add-quantity-${index}`}
                                disabled={isEditReadOnly}
                              />
                            </td>
                            <td className="p-1.5 text-right">
                              <Input
                                type="number"
                                value={getProductItemNumericInputValue(item, "extendQuantity")}
                                onChange={(e) => handleProductItemNumericInputChange(item, "extendQuantity", e.target.value)}
                                onBlur={() => handleProductItemNumericInputBlur(item, "extendQuantity", 0)}
                                className="rounded-none h-8 text-right text-sm w-16"
                                min="0"
                                data-testid={`edit-input-extend-quantity-${index}`}
                                disabled={isEditReadOnly}
                              />
                            </td>
                            <td className="p-1.5 align-middle">
                              <span className="flex h-8 items-center justify-end text-sm tabular-nums">
                                {formatCurrency(calculateWorkCost(item))}
                              </span>
                            </td>
                            <td className="p-1.5 align-middle">
                              <span className="flex h-8 items-center text-sm text-muted-foreground">
                                {item.worker || "-"}
                              </span>
                            </td>
                            <td className="p-1.5 text-center">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-none h-8 px-3 text-xs"
                                onClick={() => handleFormWorkCostOverrideOpen(item)}
                                disabled={isEditReadOnly}
                                data-testid={`button-work-cost-override-edit-${index}`}
                              >
                                수정
                              </Button>
                            </td>
                            <td className="p-1.5 align-middle">
                              <span className="flex h-8 items-center justify-end text-sm tabular-nums">
                                {formatCurrency(calculateSupplyAmount(item))}
                              </span>
                            </td>
                            <td className="p-1.5 align-middle">
                              <span className="flex h-8 items-center justify-end text-sm tabular-nums">
                                {formatCurrency(calculateVat(item))}
                              </span>
                            </td>
                            <td className="p-1.5 align-middle">
                              <span className="flex h-8 items-center justify-end text-sm tabular-nums">
                                {formatCurrency(getItemMargin(item))}
                              </span>
                            </td>
                            <td className="p-1.5 align-middle">
                              <span className="flex h-8 items-center justify-end text-sm tabular-nums">
                                {formatPercent(getItemMarginRate(item))}
                              </span>
                            </td>
                            <td className="p-1.5">
                              <Select
                                value={item.vatType}
                                onValueChange={(value) => updateProductItem(item.id, { vatType: value })}
                                disabled={isEditReadOnly}
                              >
                                <SelectTrigger className="rounded-none h-8" data-testid={`edit-select-vat-${index}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-none">
                                  <SelectItem value="포함">포함</SelectItem>
                                  <SelectItem value="미포함">미포함</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                    <div className="border-t px-2 py-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-none gap-1 px-1.5 text-xs text-muted-foreground"
                        onClick={addProductItem}
                        data-testid="edit-button-add-product-item"
                        disabled={isEditReadOnly}
                      >
                        <Plus className="w-4 h-4" />
                        새 항목 추가
                      </Button>
                    </div>

                    <div className="border-t px-2 py-1.5">
                      {renderContractTotalsSummary()}
                    </div>
                  </div>
                </div>

                <div className="w-full">
                  <div className="flex max-w-[820px] flex-col items-start gap-2">
                    <div className="grid w-full gap-2 md:grid-cols-[180px_180px_180px]">
                      <div className="space-y-1">
                        <Label className="text-xs">결제확인</Label>
                        <Select
                          value={formData.paymentMethod || ""}
                          onValueChange={(value) => setFormData({ ...formData, paymentMethod: value })}
                          disabled={isEditReadOnly || isPaymentMethodLocked}
                        >
                          <SelectTrigger className="h-8 rounded-none text-sm" data-testid="edit-select-payment-method">
                            <SelectValue placeholder="선택" />
                          </SelectTrigger>
                          <SelectContent className="rounded-none">
                            {CONTRACT_PAYMENT_METHOD_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isPaymentMethodLocked && (
                          <p className="text-[11px] text-muted-foreground">
                            입금확인과 매칭된 계약은 입금확인 목록에서 매칭 해제 후 변경할 수 있습니다.
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">입금통장</Label>
                        <Select
                          value={formData.depositBank || DEFAULT_CREATE_DEPOSIT_BANK}
                          onValueChange={(value) => setFormData({ ...formData, depositBank: value })}
                          disabled={isEditReadOnly || isPaymentMethodLocked}
                        >
                          <SelectTrigger className="h-8 rounded-none text-sm" data-testid="edit-select-deposit-bank">
                            <SelectValue placeholder="선택" />
                          </SelectTrigger>
                          <SelectContent className="rounded-none">
                            {CONTRACT_DEPOSIT_BANK_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">지급현황</Label>
                        <Select
                          value={formData.disbursementStatus || ""}
                          onValueChange={(value) => setFormData({ ...formData, disbursementStatus: value })}
                          disabled={isEditReadOnly}
                        >
                          <SelectTrigger className="h-8 rounded-none text-sm" data-testid="edit-select-disbursement-status">
                            <SelectValue placeholder="선택" />
                          </SelectTrigger>
                          <SelectContent className="rounded-none">
                            <SelectItem value="지급예정">지급예정</SelectItem>
                            <SelectItem value="지급대기">지급대기</SelectItem>
                            <SelectItem value="지급요청">지급요청</SelectItem>
                            <SelectItem value="지급완료">지급완료</SelectItem>
                            <SelectItem value="일반지급">일반지급</SelectItem>
                            <SelectItem value="지급보류">지급보류</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="w-full max-w-[320px] space-y-1">
                      <Label className="text-xs">비고</Label>
                      <Textarea
                        rows={3}
                        value={formData.notes || ""}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="min-h-[78px] rounded-none text-sm resize-none"
                        placeholder="비고 입력"
                        data-testid="edit-input-notes"
                        disabled={isEditReadOnly}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex w-full justify-end gap-2 border-t pt-3">
                  <Button
                    variant="outline"
                    onClick={() => { setIsEditOpen(false); setEditingContractId(null); setEditDialogMode("edit"); resetForm(); }}
                    className="h-8 rounded-none px-3 text-sm"
                    data-testid="edit-button-cancel"
                  >
                    {isEditReadOnly ? "닫기" : "취소"}
                  </Button>
                  {!isEditReadOnly && (
                    <Button
                      onClick={handleUpdate}
                      disabled={updateMutation.isPending}
                      className="h-8 rounded-none px-3 text-sm"
                      data-testid="edit-button-submit"
                    >
                      {updateMutation.isPending ? "수정 중..." : "수정"}
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-none gap-2 h-8" data-testid="button-date-filter">
              <CalendarIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{format(startDate, "yyyy.MM.dd")} ~ {format(endDate, "yyyy.MM.dd")}</span>
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
        <Select value={managerFilter} onValueChange={setManagerFilter}>
          <SelectTrigger className="w-auto min-w-[100px] rounded-none h-8 text-sm" data-testid="filter-manager">
            <SelectValue placeholder="담당자" />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="all">담당자</SelectItem>
            {managerFilterOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={customerFilter} onValueChange={setCustomerFilter}>
          <SelectTrigger className="w-auto min-w-[100px] rounded-none h-8 text-sm" data-testid="filter-customer">
            <SelectValue placeholder="고객명" />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="all">고객명</SelectItem>
            {customerFilterOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={productFilter} onValueChange={setProductFilter}>
          <SelectTrigger className="w-auto min-w-[100px] rounded-none h-8 text-sm" data-testid="filter-product">
            <SelectValue placeholder="상품구분" />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="all">상품구분</SelectItem>
            {productFilterOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-auto min-w-[100px] rounded-none h-8 text-sm" data-testid="filter-payment">
            <SelectValue placeholder="결제확인" />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="all">결제확인</SelectItem>
            {CONTRACT_PAYMENT_METHOD_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground rounded-none h-8 w-8"
          onClick={() => {
            setManagerFilter("all");
            setCustomerFilter("all");
            setProductFilter("all");
            setPaymentFilter("all");
            setSortOption("contractDateDesc");
            setSearchQuery("");
            setStartDate(getKoreanStartOfYear());
            setEndDate(getKoreanEndOfDay());
          }}
          data-testid="button-reset-filters"
          title="초기화"
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-none border bg-muted/20 px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={keepSelectionAcrossPages}
            onCheckedChange={(checked) => setKeepSelectionAcrossPages(checked === true)}
            data-testid="checkbox-keep-selection"
          />
          <span className="text-muted-foreground">페이지 이동 시 선택 유지</span>
        </div>
        {selectedSummary.rowCount > 0 ? (
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-medium">
              선택 {selectedSummary.rowCount}행 / {selectedSummary.contractCount}계약
            </span>
            <span>공급가액 {formatCurrency(selectedSummary.cost)}</span>
            <span>작업비 {formatCurrency(selectedSummary.workCost)}</span>
            <span>마진 {formatCurrency(selectedSummary.margin)}</span>
            <span>마진율 {formatPercent(selectedSummary.marginRate)}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-none px-2 text-xs"
              onClick={() => {
                setSelectedItems([]);
                setSelectedRowMap({});
              }}
            >
              선택 해제
            </Button>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            체크한 항목의 공급가액, 작업비, 마진, 마진율이 실시간으로 표시됩니다.
          </span>
        )}
      </div>

      {/* Table */}
      <Card className="rounded-none border">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-12">
                  <Checkbox
                    checked={isAllVisibleRowsSelected}
                    onCheckedChange={toggleSelectAll}
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
                <TableHead className="text-xs font-medium whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <span>날짜</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
                          data-testid="filter-sort-date"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="rounded-none">
                        <DropdownMenuItem onClick={() => setSortOption("contractDateDesc")}>
                          날짜 최신순
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortOption("contractDateAsc")}>
                          날짜 오래된순
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableHead>
                <TableHead className="text-xs font-medium whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <span>고객명</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
                          data-testid="filter-sort-customer"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="rounded-none">
                        <DropdownMenuItem onClick={() => setSortOption("customerNameAsc")}>
                          고객명순
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableHead>
                <TableHead className="text-xs font-medium whitespace-nowrap">사용자ID</TableHead>
                <TableHead className="text-xs font-medium whitespace-nowrap">상품</TableHead>
                <TableHead className="text-xs font-medium text-center whitespace-nowrap">일수</TableHead>
                <TableHead className="text-xs font-medium text-center whitespace-nowrap">추가</TableHead>
                <TableHead className="text-xs font-medium text-center whitespace-nowrap">연장</TableHead>
                <TableHead className="text-xs font-medium text-right whitespace-nowrap">공급가액</TableHead>
                <TableHead className="text-xs font-medium whitespace-nowrap">담당자</TableHead>
                <TableHead className="text-xs font-medium text-center whitespace-nowrap">결제확인</TableHead>
                <TableHead className="text-xs font-medium text-center whitespace-nowrap">입금통장</TableHead>
                <TableHead className="text-xs font-medium text-center whitespace-nowrap">부가세</TableHead>
                {showProfitColumns && (
                  <>
                    <TableHead className="text-xs font-medium text-right whitespace-nowrap">작업비</TableHead>
                    <TableHead className="text-xs font-medium text-right whitespace-nowrap">마진</TableHead>
                    <TableHead className="text-xs font-medium text-right whitespace-nowrap">마진율</TableHead>
                  </>
                )}
                <TableHead className="text-xs font-medium whitespace-nowrap">작업자</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={contractsTableColSpan} className="text-center py-8">
                    로딩 중...
                  </TableCell>
                </TableRow>
              ) : paginatedContracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={contractsTableColSpan} className="text-center py-8 text-muted-foreground">
                    등록된 계약이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                contractRows.map(({ rowKey, contract, item, itemIndex }) => (
                  <TableRow
                    key={rowKey}
                    className="hover:bg-muted/20 cursor-pointer"
                    data-testid={itemIndex === 0 ? `row-contract-${contract.id}` : `row-contract-${contract.id}-${itemIndex}`}
                    onClick={() => openContractDialog(contract, "edit")}
                  >
                    <TableCell className="align-top">
                      <div
                        onClick={stopSelectionEventPropagation}
                        onPointerDown={stopSelectionEventPropagation}
                      >
                        <Checkbox
                          checked={selectedItems.includes(rowKey)}
                          onCheckedChange={(checked) => toggleSelectItem(rowKey, checked)}
                          onClick={stopSelectionEventPropagation}
                          data-testid={`checkbox-contract-${contract.id}-${itemIndex}`}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap align-top">
                      {formatDate(contract.contractDate)}
                    </TableCell>
                    <TableCell className="text-xs text-primary whitespace-nowrap align-top">
                      {contract.customerName}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{item.userIdentifier || "-"}</TableCell>
                    <TableCell className="text-xs max-w-[190px] break-all">{item.productName || "-"}</TableCell>
                    <TableCell className="text-xs text-center whitespace-nowrap">{getEffectiveDays(item)}</TableCell>
                    <TableCell className="text-xs text-center whitespace-nowrap">{item.addQuantity || 0}</TableCell>
                    <TableCell className="text-xs text-center whitespace-nowrap">{item.extendQuantity || 0}</TableCell>
                    <TableCell className="text-xs text-right whitespace-nowrap">
                      <span>{formatCurrency(getItemOriginalAmount(item))}</span>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap align-top">
                      {contract.managerName}
                    </TableCell>
                    <TableCell
                      className={`text-center text-xs whitespace-nowrap align-top ${getPaymentMethodTextClassName(contract.paymentMethod)}`}
                      data-testid={`text-payment-method-${contract.id}-${itemIndex}`}
                    >
                      {(() => {
                        const paymentLabel = getPaymentMethodDisplayLabel(contract.paymentMethod) || "-";
                        const paymentAmount = getPaymentMethodDisplayAmount(contract, item);
                        return (
                          <div className="flex flex-col items-center leading-tight">
                            <span>{paymentLabel}</span>
                            {paymentAmount > 0 && (
                              <span
                                className="text-red-500 font-bold"
                                style={{ fontSize: "0.9em" }}
                                data-testid={`text-payment-method-amount-${contract.id}-${itemIndex}`}
                              >
                                -{formatCurrency(paymentAmount)}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-center text-xs whitespace-nowrap align-top">
                      {getDepositBankDisplayLabel(contract)}
                    </TableCell>
                    <TableCell className="text-center text-xs whitespace-nowrap align-top">
                      {getVatDisplayText(contract, item)}
                    </TableCell>
                    {showProfitColumns && (
                      <>
                        <TableCell className="text-xs text-right whitespace-nowrap align-top">
                          {calculateWorkCost(item) ? formatCurrency(calculateWorkCost(item)) : "-"}
                        </TableCell>
                        <TableCell className="text-xs text-right whitespace-nowrap align-top">
                          {formatCurrency(getItemMargin(item))}
                        </TableCell>
                        <TableCell className="text-xs text-right whitespace-nowrap align-top">
                          {formatPercent(getItemMarginRate(item))}
                        </TableCell>
                      </>
                    )}
                    <TableCell className="text-xs whitespace-nowrap">{item.worker || "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Select
          value={pageSize.toString()}
          onValueChange={(value) => {
            setPageSize(parseInt(value));
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-auto min-w-[120px] rounded-none h-9" data-testid="select-page-size">
            <SelectValue placeholder={`${pageSize}개씩 보기`} />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="100">100개씩 보기</SelectItem>
            <SelectItem value="500">500개씩 보기</SelectItem>
            <SelectItem value="1000">1000개씩 보기</SelectItem>
          </SelectContent>
        </Select>

        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>

      <Dialog open={isWorkCostOverrideOpen} onOpenChange={(open) => {
        if (open) {
          setIsWorkCostOverrideOpen(true);
          return;
        }
        resetWorkCostOverrideDialog();
      }}>
        <DialogContent className="rounded-none max-w-[520px]">
          <DialogHeader>
            <DialogTitle>작업비 수정</DialogTitle>
          </DialogHeader>
          {workCostOverrideTargetItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 border rounded-none text-sm">
                <div>
                  <span className="text-muted-foreground">{workCostOverrideRow ? "계약일" : "입력 위치"}</span>
                  <p className="font-medium">
                    {workCostOverrideRow
                      ? formatDate(workCostOverrideRow.contract.contractDate)
                      : isEditOpen
                        ? "계약 수정 모달"
                        : "계약 등록 모달"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">{workCostOverrideRow ? "고객명" : "현재 작업자"}</span>
                  <p className="font-medium">
                    {workCostOverrideRow ? workCostOverrideRow.contract.customerName : workCostOverrideTargetItem.worker || "-"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">상품</span>
                  <p className="font-medium">{workCostOverrideTargetItem.productName || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">사용자ID</span>
                  <p className="font-medium">{workCostOverrideTargetItem.userIdentifier || "-"}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>작업자</Label>
                <Input
                  value={overrideWorker}
                  onChange={(e) => setOverrideWorker(e.target.value)}
                  className="rounded-none"
                  data-testid="input-override-worker"
                />
              </div>

              <div className="space-y-2">
                <Label>작업비</Label>
                <Input
                  type="number"
                  value={overrideWorkCostAmount || ""}
                  onChange={(e) => setOverrideWorkCostAmount(Number(e.target.value) || 0)}
                  className="rounded-none"
                  data-testid="input-override-work-cost"
                />
                <p className="text-xs text-muted-foreground">
                  {workCostOverrideRow
                    ? "입력한 작업비는 선택한 계약 항목에 고정값으로 저장됩니다."
                    : "입력한 작업비는 현재 등록/수정 중인 상품 항목에 바로 반영됩니다."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/20 border rounded-none text-sm">
                <div>
                  <span className="text-muted-foreground">예상 마진</span>
                  <p className="font-medium">{formatCurrency(calculateMarginAmountWithWorkCost(workCostOverrideTargetItem, toNonNegativeAmount(overrideWorkCostAmount)))}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">예상 마진율</span>
                  <p className="font-medium">{formatPercent(calculateMarginRateFromMarginAmount(workCostOverrideTargetItem, calculateMarginAmountWithWorkCost(workCostOverrideTargetItem, toNonNegativeAmount(overrideWorkCostAmount))))}</p>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  className="rounded-none"
                  onClick={resetWorkCostOverrideDialog}
                  data-testid="button-override-cancel"
                >
                  취소
                </Button>
                <Button
                  className="rounded-none"
                  onClick={handleWorkCostOverrideSubmit}
                  disabled={!!workCostOverrideRow && overrideWorkCostMutation.isPending}
                  data-testid="button-override-submit"
                >
                  {workCostOverrideRow && overrideWorkCostMutation.isPending ? "저장 중..." : "저장"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={isRefundOpen} onOpenChange={(open) => {
        setIsRefundOpen(open);
        if (!open) {
          setRefundContractId(null);
          setRefundTargetItem(null);
          setRefundDate(getKoreanNow());
          setRefundAmount(0);
          setRefundQuantity(0);
          setRefundDays(0);
          setRefundAccount("");
          setRefundSlot("");
          setRefundWorker("");
          setRefundReason("");
        }
      }}>
        <DialogContent className="rounded-none max-w-[700px]">
          <DialogHeader>
            <DialogTitle>환불 등록</DialogTitle>
          </DialogHeader>
          {refundContract && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 border rounded-none">
                <div>
                  <span className="text-sm text-muted-foreground">계약일</span>
                  <p className="font-medium" data-testid="text-refund-contract-name">{formatDate(refundContract.contractDate)}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">고객</span>
                  <p className="font-medium" data-testid="text-refund-customer">{refundContract.customerName}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">선택 항목 금액</span>
                  <p className="font-medium" data-testid="text-refund-original-cost">{formatCurrency(refundTargetAmount)}원</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">총 환불 금액(이번 포함)</span>
                  <p className="font-medium text-destructive" data-testid="text-refund-total-refunded">{formatCurrency(displayTotalRefunded)}원</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">잔여 선택 항목 금액</span>
                  <p className="font-medium" data-testid="text-refund-remaining">{formatCurrency(displayRemainingRefund)}원</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">선택 상품</span>
                  <p className="font-medium">{refundTargetItem?.productName || refundContract.products || "-"}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">선택 사용자ID</span>
                  <p className="font-medium">{refundTargetItem?.userIdentifier || refundContract.userIdentifier || "-"}</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>환불일자</Label>
                  <Input
                    type="date"
                    value={format(refundDate, "yyyy-MM-dd")}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const nextDate = new Date(`${e.target.value}T00:00:00`);
                      if (!Number.isNaN(nextDate.getTime())) setRefundDate(nextDate);
                    }}
                    className="rounded-none"
                    data-testid="input-refund-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label>수량</Label>
                  <Input
                    type="number"
                    value={refundQuantity || ""}
                    onChange={(e) => setRefundQuantity(parseInt(e.target.value) || 0)}
                    className="rounded-none"
                    placeholder="수량"
                    data-testid="input-refund-quantity"
                  />
                </div>
                <div className="space-y-2">
                  <Label>환불일수</Label>
                  <Input
                    type="number"
                    value={refundDays || ""}
                    onChange={(e) => setRefundDays(parseInt(e.target.value) || 0)}
                    className="rounded-none"
                    placeholder="환불일수"
                    data-testid="input-refund-days"
                  />
                </div>
                <div className="space-y-2">
                  <Label>환불금액 *</Label>
                  <Input
                    type="number"
                    value={refundAmount || ""}
                    className="rounded-none bg-muted/30"
                    placeholder="환불 금액"
                    readOnly
                    data-testid="input-refund-amount"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>ID (자동매칭)</Label>
                  <Input
                    value={refundAccount}
                    onChange={(e) => setRefundAccount(e.target.value)}
                    className="rounded-none"
                    placeholder="계정"
                    data-testid="input-refund-account"
                  />
                </div>
                <div className="space-y-2">
                  <Label>상품명(자동매칭)</Label>
                  <Input
                    value={refundSlot}
                    onChange={(e) => setRefundSlot(e.target.value)}
                    className="rounded-none"
                    placeholder="상품"
                    data-testid="input-refund-slot"
                  />
                </div>
                <div className="space-y-2">
                  <Label>작업자(자동매칭)</Label>
                  <Input
                    value={refundWorker}
                    onChange={(e) => setRefundWorker(e.target.value)}
                    className="rounded-none"
                    placeholder="작업자"
                    data-testid="input-refund-worker"
                  />
                </div>
                <div className="space-y-2">
                  <Label>환불사유</Label>
                  <Input
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    className="rounded-none"
                    placeholder="환불 사유"
                    data-testid="input-refund-reason"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  className="rounded-none"
                  onClick={() => { setIsRefundOpen(false); setRefundContractId(null); setRefundTargetItem(null); }}
                  data-testid="button-refund-cancel"
                >
                  취소
                </Button>
                <Button
                  className="rounded-none"
                  onClick={handleRefundSubmit}
                  disabled={refundMutation.isPending || refundAmount <= 0}
                  data-testid="button-refund-submit"
                >
                  {refundMutation.isPending ? "등록 중..." : "환불관리로 보내기"}
                </Button>
              </div>

              {refundHistory.length > 0 && (
                <div className="space-y-2 pt-4 border-t">
                  <h3 className="text-sm font-semibold">환불 내역</h3>
                  <div className="border rounded-none">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-xs">환불일</TableHead>
                          <TableHead className="text-xs text-right">수량</TableHead>
                          <TableHead className="text-xs text-right">환불일수</TableHead>
                          <TableHead className="text-xs text-right">금액</TableHead>
                          <TableHead className="text-xs">계정</TableHead>
                          <TableHead className="text-xs">상품</TableHead>
                          <TableHead className="text-xs">작업자</TableHead>
                          <TableHead className="text-xs">사유</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {refundHistory.map((refund) => (
                          <TableRow key={refund.id} data-testid={`row-refund-${refund.id}`}>
                            <TableCell className="text-xs">
                              {format(new Date(refund.refundDate), "yyyy-MM-dd HH:mm", { locale: ko })}
                            </TableCell>
                            <TableCell className="text-xs text-right">{refund.quantity || 0}</TableCell>
                            <TableCell className="text-xs text-right">{refund.refundDays || 0}</TableCell>
                            <TableCell className="text-xs text-right text-destructive font-medium">
                              -{formatCurrency(refund.amount)}원
                            </TableCell>
                            <TableCell className="text-xs">{refund.account || "-"}</TableCell>
                            <TableCell className="text-xs">{refund.slot || "-"}</TableCell>
                            <TableCell className="text-xs">{refund.worker || "-"}</TableCell>
                            <TableCell className="text-xs">{refund.reason || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}











