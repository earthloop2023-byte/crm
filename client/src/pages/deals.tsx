import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/pagination";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, UserPlus, UserCheck, UserX, MapPin, Building2, Phone, Mail, Briefcase, Send, Clock, X, Minus, Download, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Deal, InsertDeal, Customer, Product, DealTimeline } from "@shared/schema";
import { addKoreanBusinessDays, normalizeToKoreanDateOnly } from "@shared/korean-business-days";
import { useSettings } from "@/lib/settings";
import { getKoreanDateKey, getKoreanEndOfDay, getKoreanNow } from "@/lib/korean-time";

type DealWithPartialInfo = Deal & {
  latestPartialCancelDate?: Date | string | null;
};

const statusLabels: Record<string, string> = {
  new: "인입",
  active: "개통",
  churned: "해지",
};

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  new: "default",
  active: "secondary",
  churned: "destructive",
};

const statusIcons: Record<string, typeof UserPlus> = {
  new: UserPlus,
  active: UserCheck,
  churned: UserX,
};

const customerDbExcelHeaders = [
  "청구계정번호",
  "상호",
  "업종/카테고리",
  "총회선수",
  "상태",
  "인입일",
  "등록일",
  "개통일",
  "해지일",
  "해지회선수",
  "통신사",
  "고객명",
  "연락처",
  "이메일",
  "고객 성향",
  "특이사항 /CS메모",
  "1차 진행상황",
  "2차 진행상황",
  "추가 진행상황",
  "유입경로",
  "해지 사유",
  "영업자",
] as const;

const customerDispositionOptions = ["상", "중", "하"] as const;
const contractStatusOptions = ["인입", "개통", "해지", "변경"] as const;
const firstProgressStatusOptions = ["영업실패", "2차 예정"] as const;
const secondProgressStatusOptions = ["가입", "상호명 고민중", "지역 선정중", "서류 준비중", "보류", "다른 상품 문의"] as const;
const additionalProgressStatusOptions = ["재영업 진행 예정", "업셀링 진행 예정"] as const;
const acquisitionChannelOptions = ["인바운드", "소개", "외부영업"] as const;
const customerDbStatusFilterOptions = [
  { value: "all", label: "전체 상태" },
  { value: "인입", label: "인입" },
  { value: "개통", label: "개통" },
  { value: "해지", label: "해지" },
  { value: "변경", label: "변경" },
] as const;

const knownTimelinePrefixes = new Set(["[인입]", "[개통]", "[해지]", "[부분해지]", "[해지사유]", "[CS메모]"]);
const CHANGED_STATUS_SENTINEL = "__changed__";

function normalizeContractStatus(value: unknown, stageHint?: string | null): string {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "(공백)") return "";
  if (normalized === CHANGED_STATUS_SENTINEL) return "변경";
  if (normalized === "변경") return "변경";
  if (normalized === "인입" || normalized === "신규" || normalized === "신규상담" || normalized === "등록/갱신예정") return "인입";
  if (normalized === "개통" || normalized === "유지" || normalized === "등록") return "개통";
  if (normalized === "해지") return "해지";
  if (stageHint === "churned") return "해지";
  if (stageHint === "active") return "개통";
  if (stageHint === "new") return "인입";
  return normalized;
}

function isChangedContractStatus(value: unknown): boolean {
  const normalized = String(value ?? "").trim();
  return !normalized || normalized === "(공백)" || normalized === "변경";
}

function toCsvCell(value: unknown): string {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

function normalizeTimelineDisplayContent(value: unknown): string {
  const content = String(value ?? "").trim();
  if (!content) return "";

  const bracketPrefixMatch = content.match(/^\[[^\]]+\]/);
  if (bracketPrefixMatch) {
    const prefix = bracketPrefixMatch[0];
    if (knownTimelinePrefixes.has(prefix)) return content;
    if (/^\[\?+\]$/.test(prefix) || prefix.includes("?")) {
      return content.replace(/^\[[^\]]+\]/, "[해지사유]");
    }
    return content;
  }

  return `[CS메모] ${content}`;
}

function normalizeTimelineAuthorName(value: unknown): string {
  const authorName = String(value ?? "").trim();
  if (!authorName || /^\?+$/.test(authorName)) return "시스템";
  return authorName;
}

function normalizeCustomerDbSearchToken(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[.\s/]+/g, "-")
    .trim();
}

type RegionalUnpaidMatchedResponse = {
  entries: Array<{ matchedDealId: string | null }>;
};

type RegionalSalesAnalyticsResponse = {
  regionalData?: {
    monthlyStatusData?: Array<{
      yearMonth: string;
      openLines: number;
    }>;
  };
};

type DisplayDealTimeline = DealTimeline & {
  synthetic?: boolean;
};

type DealSortField = "inboundDate" | "customerName" | "telecomProvider";

function normalizePhoneGroupKey(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function getDealGroupKey(deal: Pick<Deal, "title" | "phone">): string {
  const normalizedTitle = String(deal.title || "").trim().toLowerCase();
  const normalizedPhone = normalizePhoneGroupKey(deal.phone);
  if (normalizedTitle && normalizedPhone) return `name:${normalizedTitle}|phone:${normalizedPhone}`;
  if (normalizedTitle) return `name:${normalizedTitle}`;
  if (normalizedPhone) return `phone:${normalizedPhone}`;
  return "ungrouped";
}

function getSplitCancelledLineCount(
  deal: Pick<Deal, "id" | "cancelledLineCount">,
  relatedDeals: Array<Pick<Deal, "id" | "parentDealId" | "cancelledLineCount">>,
): number {
  const ownCancelled = getRawCancelledLineCount(deal);
  const childCancelled = relatedDeals
    .filter((item) => item.parentDealId === deal.id)
    .reduce((sum, item) => sum + getRawCancelledLineCount(item), 0);
  return ownCancelled + childCancelled;
}

function getEffectiveRemainingLineCount(
  deal: Pick<Deal, "id" | "lineCount" | "cancelledLineCount">,
  relatedDeals: Array<Pick<Deal, "id" | "parentDealId" | "cancelledLineCount">>,
): number {
  return Math.max(getRawLineCount(deal) - getSplitCancelledLineCount(deal, relatedDeals), 0);
}

function getRemainingLineCount(deal: Pick<Deal, "lineCount" | "cancelledLineCount">): number {
  const lineCount = Number(deal.lineCount) || 0;
  const cancelledLineCount = Number(deal.cancelledLineCount) || 0;
  return Math.max(lineCount - cancelledLineCount, 0);
}

function getRawLineCount(deal: Pick<Deal, "lineCount">): number {
  return Math.max(Number(deal.lineCount) || 0, 0);
}

function getRawCancelledLineCount(deal: Pick<Deal, "cancelledLineCount">): number {
  return Math.max(Number(deal.cancelledLineCount) || 0, 0);
}

function getReinstateLineCount(deal: Pick<Deal, "lineCount" | "cancelledLineCount">): number {
  return Math.max(getRawLineCount(deal), getRawCancelledLineCount(deal), 0);
}

function normalizeCustomerDbDate(value: Date | string | null | undefined): Date | null {
  const normalized = normalizeToKoreanDateOnly(value);
  if (!normalized) return null;
  if (normalized.getUTCFullYear() < 2000) return null;
  return normalized;
}

function addDaysToDate(value: Date | string | null | undefined, dayDelta: number): Date | null {
  return normalizeCustomerDbDate(addKoreanBusinessDays(value, dayDelta));
}

function parseDateInputValue(value: string): Date | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = new Date(`${normalized}T12:00:00+09:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateInputValue(value: Date | string | null | undefined): string {
  const normalized = normalizeCustomerDbDate(value);
  return normalized ? getKoreanDateKey(normalized) : "";
}

function DealForm({
  deal,
  existingDeals,
  customers,
  products,
  onSuccess,
  onCancel,
}: {
  deal?: Deal;
  existingDeals?: Deal[];
  customers: Customer[];
  products: Product[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();

  const stageByContractStatus: Record<string, string> = {
    인입: "new",
    개통: "active",
    해지: "churned",
  };

  const contractStatusByStage: Record<string, string> = {
    new: "인입",
    active: "개통",
    churned: "해지",
  };

  const buildInitialData = (source?: Deal): InsertDeal => ({
    title: source?.title || "",
    customerId: source?.customerId || null,
    value: source?.value || 0,
    stage: source?.stage || "new",
    probability: source?.probability || 0,
    expectedCloseDate: normalizeCustomerDbDate(source?.expectedCloseDate) || null,
    inboundDate: normalizeCustomerDbDate(source?.inboundDate || source?.expectedCloseDate) || null,
    contractStartDate: normalizeCustomerDbDate(source?.contractStartDate) || null,
    contractEndDate:
      normalizeCustomerDbDate(source?.contractEndDate) ||
      addDaysToDate(source?.contractStartDate || null, 1),
    churnDate: normalizeCustomerDbDate(source?.churnDate) || null,
    renewalDueDate: null,
    contractStatus:
      source?.contractStatus === ""
        ? ""
        : normalizeContractStatus(source?.contractStatus, source?.stage) || contractStatusByStage[source?.stage || "new"],
    notes: source?.notes || "",
    phone: source?.phone || "",
    email: source?.email || "",
    billingAccountNumber: source?.billingAccountNumber || "",
    companyName: source?.companyName || "",
    industry: source?.industry || "",
    telecomProvider: source?.telecomProvider || "",
    customerDisposition: source?.customerDisposition || "",
    customerTypeDetail: source?.customerTypeDetail || "",
    firstProgressStatus: source?.firstProgressStatus || "",
    secondProgressStatus: source?.secondProgressStatus || "",
    additionalProgressStatus: (source as any)?.additionalProgressStatus || "",
    acquisitionChannel: source?.acquisitionChannel || "",
    cancellationReason: source?.cancellationReason || "",
    salesperson: source?.salesperson || "",
    lineCount: source?.lineCount ?? 0,
    cancelledLineCount: source?.cancelledLineCount ?? 0,
    productId: source?.productId || "",
  });

  type BusinessEntryForm = {
    id: string;
    dealId?: string;
    billingAccountNumber: string;
    companyName: string;
    inboundDate: Date | null;
    contractStartDate: Date | null;
    contractEndDate: Date | null;
    churnDate: Date | null;
    lineCount: number;
    industry: string;
    contractStatus: string;
    productId: string;
    notes: string;
  };

  const createBusinessEntry = (source: Partial<InsertDeal> = {}, dealId?: string): BusinessEntryForm => ({
    id: `business-${dealId || `${Math.random().toString(36).slice(2)}-${Date.now()}`}`,
    dealId,
    billingAccountNumber: String(source.billingAccountNumber || ""),
    companyName: String(source.companyName || ""),
    inboundDate: normalizeCustomerDbDate(source.inboundDate || source.expectedCloseDate) || null,
    contractStartDate: normalizeCustomerDbDate(source.contractStartDate) || null,
    contractEndDate:
      normalizeCustomerDbDate(source.contractEndDate) ||
      addDaysToDate(source.contractStartDate || null, 1),
    churnDate: normalizeCustomerDbDate(source.churnDate) || null,
    lineCount: Number(source.lineCount || 0),
    industry: String(source.industry || ""),
    contractStatus:
      source.contractStatus === ""
        ? ""
        : normalizeContractStatus(source.contractStatus, source.stage) || "인입",
    productId: String(source.productId || ""),
    notes: String(source.notes || ""),
  });

  const initialFormData = buildInitialData(deal);
  const [formData, setFormData] = useState<InsertDeal>(initialFormData);
  const [initialBusinessDealIds, setInitialBusinessDealIds] = useState<string[]>([]);
  const [businessEntries, setBusinessEntries] = useState<BusinessEntryForm[]>([
    createBusinessEntry(initialFormData),
  ]);

  const handleBusinessContractStartDateChange = (entryId: string, rawValue: string) => {
    const nextContractStartDate = parseDateInputValue(rawValue);
    const nextOpenedDate = nextContractStartDate ? addDaysToDate(nextContractStartDate, 1) : null;
    updateBusinessEntry(entryId, {
      contractStartDate: nextContractStartDate,
      contractEndDate: nextOpenedDate,
    });
  };

  useEffect(() => {
    const source = buildInitialData(deal);
    setFormData(source);
    if (deal) {
      const sourceDeals = existingDeals && existingDeals.length > 0 ? existingDeals : [deal];
      setBusinessEntries(sourceDeals.map((item) => createBusinessEntry(buildInitialData(item), item.id)));
      setInitialBusinessDealIds(sourceDeals.map((item) => item.id));
    } else {
      setBusinessEntries([createBusinessEntry(source)]);
      setInitialBusinessDealIds([]);
    }
  }, [deal, existingDeals]);

  const addBusinessEntry = () => {
    setBusinessEntries((prev) => [...prev, createBusinessEntry()]);
  };

  const removeBusinessEntry = (id: string) => {
    setBusinessEntries((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((entry) => entry.id !== id);
    });
  };

  const updateBusinessEntry = (id: string, patch: Partial<BusinessEntryForm>) => {
    setBusinessEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  };

  const invalidateRegionalRealtimeQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sales-analytics"] });
    queryClient.invalidateQueries({ queryKey: ["/api/regional-unpaids"] });
  };

  const createMutation = useMutation({
    mutationFn: async (payloads: InsertDeal[]) => {
      for (const payload of payloads) {
        await apiRequest("POST", "/api/deals", payload);
      }
      return payloads.length;
    },
    onSuccess: (count) => {
      invalidateRegionalRealtimeQueries();
      toast({ title: `${count}개 사업자가 등록되었습니다.` });
      onSuccess();
    },
    onError: () => {
      toast({ title: "오류가 발생했습니다.", variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async (params: { items: Array<{ entry: BusinessEntryForm; payload: InsertDeal }>; removedIds: string[] }) => {
      const { items, removedIds } = params;
      let updatedCount = 0;
      let createdCount = 0;
      for (const item of items) {
        if (item.entry.dealId) {
          await apiRequest("PUT", `/api/deals/${item.entry.dealId}`, item.payload);
          updatedCount += 1;
        } else {
          await apiRequest("POST", "/api/deals", item.payload);
          createdCount += 1;
        }
      }
      for (const id of removedIds) {
        await apiRequest("DELETE", `/api/deals/${id}`);
      }
      return { updatedCount, createdCount, removedCount: removedIds.length };
    },
    onSuccess: (result) => {
      invalidateRegionalRealtimeQueries();
      toast({
        title: `고객 정보가 수정되었습니다. (수정 ${result.updatedCount}건, 추가 ${result.createdCount}건, 삭제 ${result.removedCount}건)`,
      });
      onSuccess();
    },
    onError: () => {
      toast({ title: "오류가 발생했습니다.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validEntries = businessEntries
      .filter((entry) => entry.companyName.trim())
      .map((entry) => ({
        ...entry,
        companyName: entry.companyName.trim(),
      }));

    if (validEntries.length === 0) {
      toast({ title: "사업자 상호를 1개 이상 입력해주세요.", variant: "destructive" });
      return;
    }

    const payloads: Array<{ entry: BusinessEntryForm; payload: InsertDeal }> = validEntries.map((entry) => {
      const normalizedContractStatus = normalizeContractStatus(entry.contractStatus, formData.stage);
      const normalizedStage = stageByContractStatus[normalizedContractStatus] || formData.stage || "new";
      const payloadContractStatus =
        normalizedContractStatus === "변경" ? CHANGED_STATUS_SENTINEL : normalizedContractStatus;
      const selectedProductName = products.find((product) => product.id === entry.productId)?.name || "";
      return {
        entry,
        payload: {
          ...formData,
          billingAccountNumber: entry.billingAccountNumber,
          companyName: entry.companyName,
          lineCount: Number(entry.lineCount) || 0,
          industry: entry.industry,
          notes: entry.notes,
          productId: entry.productId,
          telecomProvider: selectedProductName || formData.telecomProvider || "",
          stage: normalizedStage,
          contractStatus:
            payloadContractStatus === ""
              ? ""
              : payloadContractStatus || contractStatusByStage[normalizedStage],
          expectedCloseDate: entry.inboundDate || null,
          inboundDate: entry.inboundDate || null,
          contractStartDate: entry.contractStartDate || null,
          contractEndDate: entry.contractEndDate || addDaysToDate(entry.contractStartDate, 1),
          churnDate: entry.churnDate || null,
          renewalDueDate: null,
        },
      };
    });

    if (deal) {
      const currentDealIds = new Set(payloads.map((item) => item.entry.dealId).filter(Boolean) as string[]);
      const removedIds = initialBusinessDealIds.filter((id) => !currentDealIds.has(id));
      editMutation.mutate({ items: payloads, removedIds });
      return;
    }

    createMutation.mutate(payloads.map((item) => item.payload));
  };

  const isPending = createMutation.isPending || editMutation.isPending;
  const hasValidEntries = businessEntries.some((entry) => entry.companyName.trim());
  const regionalServiceProducts = products.filter((product) => {
    const normalizedCategory = String(product.category || "").replace(/\s+/g, "");
    return normalizedCategory.includes("타지역서비스");
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label htmlFor="title">고객명 *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="고객명 입력"
            required
            className="rounded-none"
            data-testid="input-deal-title"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">연락처</Label>
          <Input
            id="phone"
            value={formData.phone || ""}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="연락처 입력"
            className="rounded-none"
            data-testid="input-deal-phone"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customerDisposition">고객 성향</Label>
          <Select
            value={formData.customerDisposition || ""}
            onValueChange={(value) => setFormData({ ...formData, customerDisposition: value })}
          >
            <SelectTrigger className="rounded-none" data-testid="select-deal-customer-disposition">
              <SelectValue placeholder="고객 성향 선택" />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              {customerDispositionOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">이메일</Label>
          <Input
            id="email"
            type="email"
            value={formData.email || ""}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="이메일 입력"
            className="rounded-none"
            data-testid="input-deal-email"
          />
        </div>

        <div className="md:col-span-4 border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">사업자 정보</h3>
            <Button
              type="button"
              variant="outline"
              className="rounded-none h-8"
              onClick={addBusinessEntry}
              data-testid="button-add-business-entry"
            >
              + 사업자 추가
            </Button>
          </div>
          <div className="space-y-3">
            {businessEntries.map((entry, index) => (
              <div key={entry.id} className="border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">사업자 {index + 1}</span>
                  {businessEntries.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="rounded-none h-7 px-2 text-destructive"
                      onClick={() => removeBusinessEntry(entry.id)}
                      data-testid={`button-remove-business-entry-${index}`}
                    >
                      삭제
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-2">
                    <Label>청구계정번호</Label>
                    <Input
                      value={entry.billingAccountNumber}
                      onChange={(e) => updateBusinessEntry(entry.id, { billingAccountNumber: e.target.value })}
                      placeholder="청구계정번호 입력"
                      className="rounded-none"
                      data-testid={`input-deal-billing-account-number-${index}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>상호 *</Label>
                    <Input
                      value={entry.companyName}
                      onChange={(e) => updateBusinessEntry(entry.id, { companyName: e.target.value })}
                      placeholder="상호 입력"
                      className="rounded-none"
                      data-testid={`input-deal-company-name-${index}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>총회선수</Label>
                    <Input
                      type="number"
                      min="0"
                      value={entry.lineCount}
                      onChange={(e) => updateBusinessEntry(entry.id, { lineCount: parseInt(e.target.value || "0", 10) || 0 })}
                      className="rounded-none"
                      data-testid={`input-deal-line-count-${index}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>업종/카테고리</Label>
                    <Input
                      value={entry.industry}
                      onChange={(e) => updateBusinessEntry(entry.id, { industry: e.target.value })}
                      placeholder="업종/카테고리 입력"
                      className="rounded-none"
                      data-testid={`input-deal-industry-${index}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>인입일</Label>
                    <Input
                      type="date"
                      value={toDateInputValue(entry.inboundDate)}
                      onChange={(e) => updateBusinessEntry(entry.id, { inboundDate: parseDateInputValue(e.target.value) })}
                      className="rounded-none"
                      data-testid={`input-deal-inbound-date-${index}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>등록일</Label>
                    <Input
                      type="date"
                      value={toDateInputValue(entry.contractStartDate)}
                      onChange={(e) => handleBusinessContractStartDateChange(entry.id, e.target.value)}
                      className="rounded-none"
                      data-testid={`input-deal-contract-start-date-${index}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>개통일</Label>
                    <Input
                      type="date"
                      value={toDateInputValue(entry.contractEndDate)}
                      onChange={(e) => updateBusinessEntry(entry.id, { contractEndDate: parseDateInputValue(e.target.value) })}
                      className="rounded-none"
                      data-testid={`input-deal-contract-end-date-${index}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>해지일</Label>
                    <Input
                      type="date"
                      value={toDateInputValue(entry.churnDate)}
                      onChange={(e) => updateBusinessEntry(entry.id, { churnDate: parseDateInputValue(e.target.value) })}
                      className="rounded-none"
                      data-testid={`input-deal-churn-date-${index}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>상태</Label>
                    <Select
                      value={
                        isChangedContractStatus(entry.contractStatus)
                          ? "변경"
                          : normalizeContractStatus(entry.contractStatus) || "인입"
                      }
                      onValueChange={(value) =>
                        updateBusinessEntry(entry.id, { contractStatus: value })
                      }
                    >
                      <SelectTrigger className="rounded-none" data-testid={`select-deal-contract-status-${index}`}>
                        <SelectValue placeholder="계약상태 선택" />
                      </SelectTrigger>
                      <SelectContent className="rounded-none">
                        {contractStatusOptions.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>상품명</Label>
                    <Select
                      value={entry.productId || ""}
                      onValueChange={(value) => updateBusinessEntry(entry.id, { productId: value })}
                    >
                      <SelectTrigger className="rounded-none" data-testid={`select-deal-product-${index}`}>
                        <SelectValue placeholder="상품 선택" />
                      </SelectTrigger>
                      <SelectContent className="rounded-none">
                        {regionalServiceProducts.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-4">
                    <Label>특이사항 / CS메모</Label>
                    <Textarea
                      value={entry.notes}
                      onChange={(e) => updateBusinessEntry(entry.id, { notes: e.target.value })}
                      placeholder="사업자별 메모 입력"
                      className="rounded-none min-h-[72px]"
                      data-testid={`textarea-deal-notes-${index}`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cancelledLineCount">해지회선수</Label>
          <Input
            id="cancelledLineCount"
            type="number"
            min="0"
            value={formData.cancelledLineCount ?? 0}
            onChange={(e) =>
              setFormData({
                ...formData,
                cancelledLineCount: parseInt(e.target.value || "0", 10) || 0,
              })
            }
            className="rounded-none"
            data-testid="input-deal-cancelled-line-count"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="firstProgressStatus">1차 진행상황</Label>
          <Select
            value={formData.firstProgressStatus || ""}
            onValueChange={(value) => setFormData({ ...formData, firstProgressStatus: value })}
          >
            <SelectTrigger className="rounded-none" data-testid="select-deal-first-progress-status">
              <SelectValue placeholder="1차 진행상황 선택" />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              {firstProgressStatusOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="secondProgressStatus">2차 진행상황</Label>
          <Select
            value={formData.secondProgressStatus || ""}
            onValueChange={(value) => setFormData({ ...formData, secondProgressStatus: value })}
          >
            <SelectTrigger className="rounded-none" data-testid="select-deal-second-progress-status">
              <SelectValue placeholder="2차 진행상황 선택" />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              {secondProgressStatusOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="additionalProgressStatus">추가 진행상황</Label>
          <Select
            value={formData.additionalProgressStatus || ""}
            onValueChange={(value) => setFormData({ ...formData, additionalProgressStatus: value })}
          >
            <SelectTrigger className="rounded-none" data-testid="select-deal-additional-progress-status">
              <SelectValue placeholder="추가 진행상황 선택" />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              {additionalProgressStatusOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="acquisitionChannel">유입경로</Label>
          <Select
            value={formData.acquisitionChannel || ""}
            onValueChange={(value) => setFormData({ ...formData, acquisitionChannel: value })}
          >
            <SelectTrigger className="rounded-none" data-testid="select-deal-acquisition-channel">
              <SelectValue placeholder="유입경로 선택" />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              {acquisitionChannelOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="salesperson">영업자</Label>
          <Input
            id="salesperson"
            value={formData.salesperson || ""}
            onChange={(e) => setFormData({ ...formData, salesperson: e.target.value })}
            placeholder="영업자 입력"
            className="rounded-none"
            data-testid="input-deal-salesperson"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          className="rounded-none"
          onClick={onCancel}
          data-testid="button-cancel"
        >
          취소
        </Button>
        <Button
          type="submit"
          className="rounded-none"
          disabled={isPending || !formData.title || !hasValidEntries}
          data-testid="button-submit-deal"
        >
          {isPending ? "저장 중..." : deal ? "수정" : "등록"}
        </Button>
      </div>
    </form>
  );
}

function CustomerCard({ deal, customer, product, onEdit, onDelete, onSelect }: {
  deal: Deal;
  customer?: Customer;
  product?: Product;
  onEdit: () => void;
  onDelete: () => void;
  onSelect: () => void;
}) {
  const { formatDate } = useSettings();
  const StatusIcon = statusIcons[deal.stage] || UserPlus;
  const currentRemainingLineCount = getRemainingLineCount(deal);

  return (
    <Card className="hover-elevate rounded-none cursor-pointer" onClick={onSelect} data-testid={`card-deal-${deal.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={statusColors[deal.stage] || "secondary"} className="rounded-none text-[10px]">
                <StatusIcon className="w-3 h-3 mr-1" />
                {statusLabels[deal.stage] || deal.stage}
              </Badge>
              {currentRemainingLineCount > 0 && (
                <Badge variant="outline" className="rounded-none text-[10px]">
                  {currentRemainingLineCount}회선
                </Badge>
              )}
            </div>
            <h3 className="font-medium text-sm mb-1 truncate" data-testid={`text-deal-title-${deal.id}`}>{deal.title}</h3>
            {deal.companyName && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Building2 className="w-3 h-3" />
                <span>{deal.companyName}</span>
              </div>
            )}
            {deal.phone && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Phone className="w-3 h-3" />
                <span>{deal.phone}</span>
              </div>
            )}
            {deal.email && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Mail className="w-3 h-3" />
                <span>{deal.email}</span>
              </div>
            )}
            {deal.industry && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Briefcase className="w-3 h-3" />
                <span>{deal.industry}</span>
              </div>
            )}
            {product && (
              <div className="text-xs text-muted-foreground mb-1" data-testid={`text-deal-product-${deal.id}`}>
                {product.name}
              </div>
            )}
            <div className="flex items-center gap-3 text-xs mt-2 text-muted-foreground">
              {normalizeCustomerDbDate(deal.inboundDate ?? deal.expectedCloseDate) && (
                <span>
                  인입일 {formatDate(normalizeCustomerDbDate(deal.inboundDate ?? deal.expectedCloseDate) as Date)}
                </span>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="flex-shrink-0" onClick={(e) => e.stopPropagation()} data-testid={`button-deal-menu-${deal.id}`}>
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-none">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }} data-testid={`button-edit-deal-${deal.id}`}>
                <Pencil className="w-4 h-4 mr-2" />
                수정
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }} data-testid={`button-delete-deal-${deal.id}`}>
                <Trash2 className="w-4 h-4 mr-2" />
                삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineDetail({
  deal,
  product,
  relatedDeals,
  products,
  openPartialCancelInitially,
  onClose,
}: {
  deal: Deal;
  product?: Product;
  relatedDeals: Deal[];
  products: Product[];
  openPartialCancelInitially?: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { formatDate, formatDateTime } = useSettings();
  const [content, setContent] = useState("");
  const [showPartialCancel, setShowPartialCancel] = useState(false);
  const [cancelCount, setCancelCount] = useState(1);
  const [cancelReason, setCancelReason] = useState("");
  const [timelinePage, setTimelinePage] = useState(1);
  const StatusIcon = statusIcons[deal.stage] || UserPlus;
  const relatedBusinessDeals = useMemo(
    () => (relatedDeals.length > 0 ? relatedDeals : [deal]),
    [relatedDeals, deal],
  );
  const currentRemainingLineCount = useMemo(
    () => getEffectiveRemainingLineCount(deal, relatedBusinessDeals),
    [deal, relatedBusinessDeals],
  );
  const relatedRemainingLineCount = useMemo(
    () =>
      relatedBusinessDeals.reduce((sum, item) => {
        if (item.parentDealId) return sum;
        return sum + getEffectiveRemainingLineCount(item, relatedBusinessDeals);
      }, 0),
    [relatedBusinessDeals],
  );

  useEffect(() => {
    setShowPartialCancel(Boolean(openPartialCancelInitially));
  }, [openPartialCancelInitially, deal.id]);

  useEffect(() => {
    setCancelCount((prev) => {
      const maxValue = Math.max(currentRemainingLineCount, 1);
      return Math.max(1, Math.min(prev, maxValue));
    });
  }, [currentRemainingLineCount, deal.id]);

  const { data: timelines = [], isLoading } = useQuery<DisplayDealTimeline[]>({
    queryKey: ["/api/deals", deal.id, "timelines"],
    enabled: Boolean(deal.id),
    queryFn: async () => {
      const res = await fetch(`/api/deals/${deal.id}/timelines`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      const loadedTimelines = (await res.json()) as DealTimeline[];

      const cancellationReason = String(deal.cancellationReason || "").trim();
      const hasExistingReasonTimeline = loadedTimelines.some(
        (timeline) =>
          String(timeline.content || "").includes("[해지사유]") ||
          String(timeline.content || "").includes(cancellationReason),
      );

      const syntheticReasonTimeline =
        cancellationReason && !hasExistingReasonTimeline
          ? [
              {
                id: `synthetic-cancellation-reason-${deal.id}`,
                dealId: deal.id,
                content: `[해지사유] ${cancellationReason}`,
                authorId: null,
                authorName: "시스템",
                createdAt:
                  deal.churnDate ||
                  deal.contractEndDate ||
                  deal.contractStartDate ||
                  deal.inboundDate ||
                  deal.createdAt ||
                  new Date(),
                synthetic: true,
              } satisfies DisplayDealTimeline,
            ]
          : [];

      return [...loadedTimelines, ...syntheticReasonTimeline].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    },
  });

  useEffect(() => {
    setTimelinePage(1);
  }, [deal.id]);

  const totalTimelinePages = Math.max(1, Math.ceil(timelines.length / 5));

  useEffect(() => {
    setTimelinePage((prev) => Math.min(prev, totalTimelinePages));
  }, [totalTimelinePages]);

  const paginatedTimelines = useMemo(() => {
    const startIndex = (timelinePage - 1) * 5;
    return timelines.slice(startIndex, startIndex + 5);
  }, [timelinePage, timelines]);

  const { data: currentUser } = useQuery<{ id: string; name: string }>({
    queryKey: ["/api/auth/me"],
  });

  const invalidateRegionalRealtimeQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sales-analytics"] });
    queryClient.invalidateQueries({ queryKey: ["/api/regional-unpaids"] });
  };

  const createMutation = useMutation({
    mutationFn: async (data: { content: string; authorId?: string; authorName?: string }) => {
      return apiRequest("POST", `/api/deals/${deal.id}/timelines`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals", deal.id, "timelines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      setContent("");
    },
    onError: () => {
      toast({ title: "오류가 발생했습니다.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/deals/timelines/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals", deal.id, "timelines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
    },
  });

  const partialCancelMutation = useMutation({
    mutationFn: async (data: { cancelCount: number; reason: string }) => {
      const res = await apiRequest("POST", `/api/deals/${deal.id}/partial-cancel`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidateRegionalRealtimeQueries();
      queryClient.invalidateQueries({ queryKey: ["/api/deals", deal.id, "timelines"] });
      setShowPartialCancel(false);
      setCancelCount(1);
      setCancelReason("");
      toast({ title: "부분 해지가 처리되었습니다." });
      onClose();
    },
    onError: (error: any) => {
      toast({ title: error?.message || "오류가 발생했습니다.", variant: "destructive" });
    },
  });

  const handlePartialCancel = () => {
    if (cancelCount < 1 || cancelCount > currentRemainingLineCount) return;
    partialCancelMutation.mutate({ cancelCount, reason: cancelReason });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    createMutation.mutate({
      content: content.trim(),
      authorId: currentUser?.id,
      authorName: currentUser?.name,
    });
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] rounded-none max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant={statusColors[deal.stage] || "secondary"} className="rounded-none text-[10px]">
                <StatusIcon className="w-3 h-3 mr-1" />
                {statusLabels[deal.stage] || deal.stage}
              </Badge>
              {(deal.lineCount ?? 0) > 0 && (
                <Badge variant="outline" className="rounded-none text-[10px]">
                  {deal.lineCount}회선
                </Badge>
              )}
            </div>
          </div>
          <DialogTitle>{deal.title}</DialogTitle>
          <DialogDescription className="space-y-1">
            {deal.companyName && (
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3 h-3" />
                {deal.companyName}
              </span>
            )}
            {deal.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="w-3 h-3" />
                {deal.phone}
              </span>
            )}
            {deal.email && (
              <span className="flex items-center gap-1.5">
                <Mail className="w-3 h-3" />
                {deal.email}
              </span>
            )}
            {deal.industry && (
              <span className="flex items-center gap-1.5">
                <Briefcase className="w-3 h-3" />
                {deal.industry}
              </span>
            )}
            {product && (
              <span className="flex items-center gap-1.5">
                상품: {product.name}
              </span>
            )}
            {normalizeCustomerDbDate(deal.inboundDate ?? deal.expectedCloseDate) && (
              <span className="flex items-center gap-1.5">
                인입일: {formatDate(normalizeCustomerDbDate(deal.inboundDate ?? deal.expectedCloseDate) as Date)}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">사업자 목록</h4>
            <span className="text-xs text-muted-foreground">
              {relatedBusinessDeals.length}개 사업자 /{" "}
              {relatedRemainingLineCount.toLocaleString()}회선
            </span>
          </div>
          <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
            {relatedBusinessDeals.map((business) => (
              <div
                key={business.id}
                className={`flex items-center justify-between gap-2 text-xs p-2 border ${business.id === deal.id ? "bg-muted/40 border-primary/40" : ""}`}
              >
                <div className="truncate">
                  {business.billingAccountNumber ? `[${business.billingAccountNumber}] ` : ""}
                  {business.companyName || "-"}
                  {business.productId ? (
                    <span className="text-muted-foreground">
                      {" "}
                      ({products.find((item) => item.id === business.productId)?.name || "상품 미지정"})
                    </span>
                  ) : null}
                </div>
                <span className="whitespace-nowrap font-medium">
                  {getRemainingLineCount(business).toLocaleString()}회선
                </span>
              </div>
            ))}
          </div>
        </div>

        {showPartialCancel && (
          <div className="border border-destructive/20 bg-destructive/5 p-4 space-y-3">
            <h4 className="text-sm font-medium text-destructive flex items-center gap-1.5">
              <Minus className="w-4 h-4" />
              부분 해지
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">해지 회선 수</Label>
                <Input
                  type="number"
                  min={1}
                  max={Math.max(currentRemainingLineCount, 1)}
                  value={cancelCount}
                  onChange={(e) => setCancelCount(parseInt(e.target.value) || 1)}
                  className="rounded-none"
                  data-testid="input-cancel-count"
                />
                <p className="text-xs text-muted-foreground">
                  현재 {currentRemainingLineCount}회선 중 {cancelCount}회선 해지, 잔여 {Math.max(currentRemainingLineCount - cancelCount, 0)}회선
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">사유 (선택)</Label>
                <Input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="해지 사유 입력"
                  className="rounded-none"
                  data-testid="input-cancel-reason"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-none"
                onClick={() => setShowPartialCancel(false)}
                data-testid="button-cancel-partial"
              >
                취소
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="rounded-none"
                onClick={handlePartialCancel}
                disabled={cancelCount < 1 || cancelCount > currentRemainingLineCount || partialCancelMutation.isPending}
                data-testid="button-confirm-partial-cancel"
              >
                {partialCancelMutation.isPending ? "처리 중..." : `${cancelCount}회선 해지 확인`}
              </Button>
            </div>
          </div>
        )}

        <div className="border-t pt-4 flex-1 min-h-0 flex flex-col">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            타임라인
          </h4>
          <ScrollArea className="flex-1 min-h-0 max-h-[350px] pr-3">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : timelines.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-timeline-empty">
                아직 타임라인이 없습니다.
              </div>
            ) : (
              <div className="space-y-3" data-testid="timeline-list">
                {paginatedTimelines.map((tl) => (
                  <div key={tl.id} className="relative border-l-2 border-muted pl-4 pb-1" data-testid={`timeline-item-${tl.id}`}>
                    <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-primary" />
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm whitespace-pre-wrap break-words">{normalizeTimelineDisplayContent(tl.content)}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{normalizeTimelineAuthorName(tl.authorName)}</span>
                          <span>{formatDateTime(tl.createdAt)}</span>
                        </div>
                      </div>
                      {!tl.synthetic ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="flex-shrink-0"
                          onClick={() => deleteMutation.mutate(tl.id)}
                          data-testid={`button-delete-timeline-${tl.id}`}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {timelines.length > 5 ? (
            <div className="mt-3 pt-3 border-t">
              <Pagination currentPage={timelinePage} totalPages={totalTimelinePages} onPageChange={setTimelinePage} />
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-3 pt-3 border-t">
            <Input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="타임라인 내용을 입력하세요..."
              className="rounded-none flex-1"
              data-testid="input-timeline-content"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!content.trim() || createMutation.isPending}
              className="rounded-none"
              data-testid="button-submit-timeline"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DealsPage() {
  const { toast } = useToast();
  const { formatDate } = useSettings();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<DealSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | undefined>();
  const [selectedDeal, setSelectedDeal] = useState<Deal | undefined>();
  const [selectedDealIds, setSelectedDealIds] = useState<Set<string>>(new Set());
  const [openPartialCancelFromHeader, setOpenPartialCancelFromHeader] = useState(false);
  const [showTerminateDialog, setShowTerminateDialog] = useState(false);
  const [terminateReason, setTerminateReason] = useState("");
  const [terminateTargets, setTerminateTargets] = useState<Deal[]>([]);
  const [showAddLinesDialog, setShowAddLinesDialog] = useState(false);
  const [lineAddCount, setLineAddCount] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const regionalAnalyticsFilterParams = useMemo(() => {
    const now = getKoreanNow();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      startDate: getKoreanDateKey(monthStart),
      endDate: getKoreanDateKey(getKoreanEndOfDay()),
      managerName: "all",
      customerName: "all",
      productFilter: "all",
      departmentFilter: "타지역팀",
    };
  }, []);

  const { data: deals = [], isLoading: dealsLoading } = useQuery<DealWithPartialInfo[]>({
    queryKey: ["/api/deals"],
  });

  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: matchedUnpaidData } = useQuery<RegionalUnpaidMatchedResponse>({
    queryKey: ["/api/regional-unpaids", "matched-only"],
    queryFn: async () => {
      const res = await fetch("/api/regional-unpaids?matchedOnly=true", { credentials: "include" });
      if (!res.ok) return { entries: [] };
      return res.json();
    },
  });

  const { data: regionalAnalytics } = useQuery<RegionalSalesAnalyticsResponse>({
    queryKey: ["/api/sales-analytics", "regional-customer-db", regionalAnalyticsFilterParams],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
    queryFn: async ({ queryKey }) => {
      const [, , params] = queryKey as [string, string, Record<string, string>];
      const queryString = new URLSearchParams(params).toString();
      const res = await fetch(`/api/sales-analytics?${queryString}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch regional sales analytics");
      return res.json();
    },
  });

  const validCustomerDbRowIds = useMemo(
    () =>
      deals.flatMap((deal) => {
        const cancelledLines = getRawCancelledLineCount(deal);
        const remainingLines = getRemainingLineCount(deal);
        const hasSplitPartialRows =
          deal.stage !== "churned" && cancelledLines > 0 && remainingLines > 0;
        return hasSplitPartialRows ? [deal.id, `${deal.id}__partial_churn`] : [deal.id];
      }),
    [deals],
  );

  useEffect(() => {
    setSelectedDealIds((prev) => {
      const validIds = new Set(validCustomerDbRowIds);
      const next = new Set(Array.from(prev).filter((id) => validIds.has(id)));
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [validCustomerDbRowIds]);

  const invalidateRegionalRealtimeQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sales-analytics"] });
    queryClient.invalidateQueries({ queryKey: ["/api/regional-unpaids"] });
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => apiRequest("DELETE", `/api/deals/${id}`)));
    },
    onSuccess: () => {
      invalidateRegionalRealtimeQueries();
      setSelectedDealIds(new Set());
      toast({ title: "선택한 고객이 삭제되었습니다." });
    },
    onError: () => {
      toast({ title: "오류가 발생했습니다.", variant: "destructive" });
    },
  });

  const addLinesMutation = useMutation({
    mutationFn: async (params: { dealId: string; addCount: number }) => {
      const res = await apiRequest("POST", `/api/deals/${params.dealId}/add-lines`, {
        addCount: params.addCount,
      });
      return res.json();
    },
    onSuccess: (updatedDeal: Deal) => {
      invalidateRegionalRealtimeQueries();
      queryClient.invalidateQueries({ queryKey: ["/api/deals", updatedDeal.id, "timelines"] });
      setSelectedDeal((prev) => (prev?.id === updatedDeal.id ? updatedDeal : prev));
      setShowAddLinesDialog(false);
      setLineAddCount(1);
      toast({ title: "회선 추가가 반영되었습니다." });
    },
    onError: () => {
      toast({ title: "회선 추가 중 오류가 발생했습니다.", variant: "destructive" });
    },
  });

  const copyMutation = useMutation({
    mutationFn: async (sourceDeals: Deal[]) => {
      const copiedAt = new Date();
      let copiedCount = 0;
      let skippedCount = 0;
      const failedEntries: string[] = [];

      for (const source of sourceDeals) {
        if (isFullyChurnedDeal(source)) {
          skippedCount += 1;
          continue;
        }

        const remainingLineCount = getRemainingLineCount(source);
        if (remainingLineCount < 1) {
          skippedCount += 1;
          continue;
        }

        const payload: InsertDeal = {
          title: source.title || "",
          customerId: source.customerId || null,
          value: Number(source.value) || 0,
          stage: "new",
          probability: Number(source.probability) || 0,
          expectedCloseDate: copiedAt,
          inboundDate: copiedAt,
          contractStartDate: null,
          contractEndDate: null,
          churnDate: null,
          renewalDueDate: null,
          contractStatus: "인입",
          notes: source.notes || "",
          phone: source.phone || "",
          email: source.email || "",
          billingAccountNumber: source.billingAccountNumber || "",
          companyName: source.companyName || "",
          industry: source.industry || "",
          telecomProvider: source.telecomProvider || "",
          customerDisposition: source.customerDisposition || "",
          customerTypeDetail: source.customerTypeDetail || "",
          firstProgressStatus: source.firstProgressStatus || "",
          secondProgressStatus: source.secondProgressStatus || "",
          additionalProgressStatus: (source as any).additionalProgressStatus || "",
          acquisitionChannel: source.acquisitionChannel || "",
          cancellationReason: "",
          salesperson: source.salesperson || "",
          lineCount: remainingLineCount,
          cancelledLineCount: 0,
          productId: source.productId || "",
        };

        try {
          await apiRequest("POST", "/api/deals", payload);
          copiedCount += 1;
        } catch {
          failedEntries.push(source.companyName || source.title || source.id);
        }
      }

      if (copiedCount === 0 && failedEntries.length > 0) {
        throw new Error("복사 가능한 사업자 항목을 생성하지 못했습니다.");
      }
      return { copiedCount, skippedCount, failedEntries };
    },
    onSuccess: (result) => {
      invalidateRegionalRealtimeQueries();
      setSelectedDealIds(new Set());
      const messages = [`복사 ${result.copiedCount}건`];
      if (result.skippedCount > 0) messages.push(`해지 제외 ${result.skippedCount}건`);
      if (result.failedEntries.length > 0) messages.push(`실패 ${result.failedEntries.length}건`);
      toast({
        title: messages.join(", "),
        variant: result.failedEntries.length > 0 ? "destructive" : "default",
      });
    },
    onError: () => {
      toast({ title: "복사 중 오류가 발생했습니다.", variant: "destructive" });
    },
  });

  const resolveRestoreStage = (deal: Deal) => {
    if (deal.preChurnStage === "new" || deal.preChurnStage === "active") return deal.preChurnStage;
    const status = String(deal.contractStatus || "").trim();
    if (status === "인입" || status === "신규" || status === "신규상담" || status === "등록/갱신예정") return "new";
    return "active";
  };

  const bulkTerminateMutation = useMutation({
    mutationFn: async (params: { targets: Deal[]; reason: string }) => {
      const { targets, reason } = params;
      await Promise.all(
        targets.map((target) =>
          apiRequest("PUT", `/api/deals/${target.id}`, {
            stage: "churned",
            contractStatus: "해지",
            churnDate: new Date(),
            cancelledLineCount: Math.max(Number(target.lineCount) || 0, Number(target.cancelledLineCount) || 0),
            cancellationReason: reason || target.cancellationReason || "",
          }),
        ),
      );
    },
    onSuccess: () => {
      invalidateRegionalRealtimeQueries();
      setShowTerminateDialog(false);
      setTerminateReason("");
      setTerminateTargets([]);
      setSelectedDealIds(new Set());
      toast({ title: "선택한 고객을 해지 처리했습니다." });
    },
    onError: () => {
      toast({ title: "오류가 발생했습니다.", variant: "destructive" });
    },
  });

  const reinstateMutation = useMutation({
    mutationFn: async (targets: Deal[]) => {
      const restoredResults = await Promise.all(
        targets.map(async (target) => {
          const restoredLineCount = getReinstateLineCount(target);
          if (target.stage !== "churned" && (Number(target.cancelledLineCount) || 0) > 0) {
            const restoredContractStatus =
              String(target.contractStatus || "").trim() === "해지"
                ? "개통"
                : normalizeContractStatus(target.contractStatus, target.stage) || "개통";
            await apiRequest("PUT", `/api/deals/${target.id}`, {
              stage: "active",
              lineCount: restoredLineCount,
              cancelledLineCount: 0,
              contractStatus: restoredContractStatus,
              churnDate: null,
              cancellationReason: "",
            });
            return {
              id: target.id,
              stage: "active",
              contractStatus: restoredContractStatus,
              lineCount: restoredLineCount,
              cancelledLineCount: 0,
              churnDate: null,
            };
          }

          const restoreStage = resolveRestoreStage(target);
          const restoreContractStatus = restoreStage === "new" ? "인입" : "개통";
          let restoredByReinstateApi = false;
          let restoredPayload: any = null;

          try {
            const response = await apiRequest("POST", `/api/deals/${target.id}/reinstate`);
            const restored = await response.json().catch(() => null);
            if (restored && restored.stage !== "churned") {
              restoredByReinstateApi = true;
              restoredPayload = restored;
            }
          } catch {
            restoredByReinstateApi = false;
          }

          if (!restoredByReinstateApi) {
            await apiRequest("PUT", `/api/deals/${target.id}`, {
              stage: restoreStage,
              contractStatus: restoreContractStatus,
              lineCount: restoredLineCount,
              cancelledLineCount: 0,
              churnDate: null,
              preChurnStage: null,
            });
            return {
              id: target.id,
              stage: restoreStage,
              contractStatus: restoreContractStatus,
              lineCount: restoredLineCount,
              cancelledLineCount: 0,
              churnDate: null,
            };
          }
          return {
            id: target.id,
            stage: restoredPayload?.stage || restoreStage,
            contractStatus: restoredPayload?.contractStatus || restoreContractStatus,
            lineCount: Number(restoredPayload?.lineCount ?? target.lineCount) || 0,
            cancelledLineCount: Number(restoredPayload?.cancelledLineCount ?? 0) || 0,
            churnDate: restoredPayload?.churnDate || null,
          };
        }),
      );
      return restoredResults;
    },
    onSuccess: (restoredTargets) => {
      const restoredMap = new Map(
        restoredTargets.map((item) => [
          item.id,
          {
            stage: item.stage,
            contractStatus: item.contractStatus,
            lineCount: item.lineCount,
            cancelledLineCount: item.cancelledLineCount,
            churnDate: item.churnDate,
          },
        ]),
      );
      queryClient.setQueryData<Deal[]>(["/api/deals"], (prev) =>
        (prev || []).map((deal) => {
          const restored = restoredMap.get(deal.id);
          if (!restored) return deal;
          return {
            ...deal,
            stage: restored.stage,
            contractStatus: restored.contractStatus,
            lineCount: restored.lineCount,
            cancelledLineCount: restored.cancelledLineCount,
            churnDate: restored.churnDate,
            preChurnStage: null,
            cancellationReason: "",
          };
        }),
      );
      invalidateRegionalRealtimeQueries();
      queryClient.refetchQueries({ queryKey: ["/api/deals"] });
      setSelectedDealIds(new Set());
      toast({ title: "선택한 해지 고객을 해지철회 처리했습니다." });
    },
    onError: () => {
      toast({ title: "해지철회 처리 중 오류가 발생했습니다.", variant: "destructive" });
    },
  });

  const getCustomer = (customerId: string | null) => customerId ? customers.find((c) => c.id === customerId) : undefined;
  const getProduct = (productId: string | null | undefined) => productId ? products.find((p) => p.id === productId) : undefined;
  const matchedUnpaidDealIdSet = useMemo(
    () =>
      new Set(
        (matchedUnpaidData?.entries || [])
          .map((entry) => entry.matchedDealId)
          .filter((id): id is string => Boolean(id)),
      ),
    [matchedUnpaidData],
  );
  const isFullyChurnedDeal = (deal: Deal) =>
    deal.stage === "churned" || getRemainingLineCount(deal) <= 0;

  const getNormalizedContractStatus = (deal: Deal): string => {
    if (isChangedContractStatus(deal.contractStatus)) return "변경";
    const normalized = normalizeContractStatus(deal.contractStatus, deal.stage);
    if (normalized) return normalized;
    if (isFullyChurnedDeal(deal)) return "해지";
    return deal.stage === "active" ? "개통" : "인입";
  };

  const getCustomerDbRow = (deal: Deal) => {
    const customer = getCustomer(deal.customerId);
    const product = getProduct(deal.productId);
    const remainingLineCount = getRemainingLineCount(deal);
    const stageStatus =
      isChangedContractStatus(deal.contractStatus)
        ? "변경"
        : isFullyChurnedDeal(deal)
          ? "해지"
          : deal.stage === "active"
            ? "개통"
            : "인입";
    const inboundDate = normalizeCustomerDbDate(deal.inboundDate ?? deal.expectedCloseDate ?? deal.createdAt);
    const contractStartDate = normalizeCustomerDbDate(deal.contractStartDate);
    const contractEndDate = normalizeCustomerDbDate(deal.contractEndDate);
    const churnDate = normalizeCustomerDbDate(deal.churnDate);

    return {
      billingAccountNumber: String(deal.billingAccountNumber ?? ""),
      companyName: deal.companyName || "",
      industry: deal.industry || "",
      totalLines: remainingLineCount,
      contractStatus:
        isChangedContractStatus(deal.contractStatus)
          ? "변경"
          : normalizeContractStatus(deal.contractStatus, deal.stage) || stageStatus,
      inboundDate,
      contractStartDate,
      contractEndDate,
      churnDate,
      cancelledLines: getRawCancelledLineCount(deal),
      telecomProvider: String(deal.telecomProvider ?? product?.name ?? ""),
      customerName: deal.title || customer?.name || "",
      phone: deal.phone || customer?.phone || "",
      email: deal.email || customer?.email || "",
      customerDisposition: String(deal.customerDisposition ?? ""),
      csMemo: deal.notes || "",
      firstProgressStatus: String(deal.firstProgressStatus ?? ""),
      secondProgressStatus: String(deal.secondProgressStatus ?? ""),
      additionalProgressStatus: String((deal as any).additionalProgressStatus ?? ""),
      acquisitionChannel: String(deal.acquisitionChannel ?? ""),
      cancellationReason: String(deal.cancellationReason ?? ""),
      salesperson: String(deal.salesperson ?? ""),
    };
  };

  const customerDbListRows = useMemo(() => {
    const parentDealIdsWithActualSplitRows = new Set(
      deals
        .map((deal) => String(deal.parentDealId || "").trim())
        .filter((value): value is string => Boolean(value)),
    );
    return deals.flatMap((deal) => {
      const mapped = getCustomerDbRow(deal);
      const cancelledLines = getRawCancelledLineCount(deal);
      const remainingLines = getRemainingLineCount(deal);
      const hasActualSplitRows = parentDealIdsWithActualSplitRows.has(deal.id);
      const isPartialChurnRowSet =
        !deal.parentDealId && !hasActualSplitRows && deal.stage !== "churned" && cancelledLines > 0 && remainingLines > 0;
      const isChangedStatus = isChangedContractStatus(deal.contractStatus);

      if (!isPartialChurnRowSet) {
        return [
          {
            rowId: deal.id,
            sourceDeal: deal,
            mapped: hasActualSplitRows
              ? {
                  ...mapped,
                  cancelledLines: 0,
                  cancellationReason: "",
                  churnDate: null,
                }
              : mapped,
          },
        ];
      }

      return [
        {
          rowId: deal.id,
          sourceDeal: deal,
          mapped: {
            ...mapped,
            totalLines: remainingLines,
            cancelledLines: 0,
            contractStatus: isChangedStatus ? "변경" : deal.stage === "active" ? "개통" : "인입",
            churnDate: null,
            cancellationReason: "",
          },
        },
        {
          rowId: `${deal.id}__partial_churn`,
          sourceDeal: deal,
          mapped: {
            ...mapped,
            totalLines: 0,
            cancelledLines,
            contractStatus: isChangedStatus ? "변경" : "해지",
            churnDate: normalizeCustomerDbDate(deal.latestPartialCancelDate ?? null),
          },
        },
      ];
    });
  }, [deals, customers, products]);

  const downloadCustomerDbExcelRows = () => {
    const rows = sortedCustomerDbRows.map(({ mapped }) => {
      return [
        mapped.billingAccountNumber,
        mapped.companyName,
        mapped.industry,
        mapped.totalLines,
        mapped.contractStatus,
        mapped.inboundDate ? formatDate(mapped.inboundDate as Date | string) : "",
        mapped.contractStartDate ? formatDate(mapped.contractStartDate as Date | string) : "",
        mapped.contractEndDate ? formatDate(mapped.contractEndDate as Date | string) : "",
        mapped.churnDate ? formatDate(mapped.churnDate as Date | string) : "",
        mapped.cancelledLines,
        mapped.telecomProvider,
        mapped.customerName,
        mapped.phone,
        mapped.email,
        mapped.customerDisposition,
        mapped.csMemo,
        mapped.firstProgressStatus,
        mapped.secondProgressStatus,
        mapped.additionalProgressStatus,
        mapped.acquisitionChannel,
        mapped.cancellationReason,
        mapped.salesperson,
      ];
    });

    const csvLines = [
      customerDbExcelHeaders.map(toCsvCell).join(","),
      ...rows.map((row) => row.map(toCsvCell).join(",")),
    ];
    const csvText = `\uFEFF${csvLines.join("\r\n")}`;
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `\uACE0\uAC1DDB_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const statusCounts = useMemo(() => {
    const currentKoreanMonthKey = getKoreanDateKey(getKoreanNow()).slice(0, 7);
    const inboundRows = customerDbListRows.filter(({ mapped }) => mapped.contractStatus === "인입");
    const openedRows = customerDbListRows.filter(({ mapped }) => mapped.contractStatus === "개통");
    const currentMonthOpenedRows = openedRows.filter(({ mapped }) => {
      if (!mapped.contractStartDate) return false;
      return getKoreanDateKey(mapped.contractStartDate as Date | string).startsWith(currentKoreanMonthKey);
    });
    const changedRows = customerDbListRows.filter(({ mapped }) => mapped.contractStatus === "변경");
    const cancelledRows = customerDbListRows.filter(({ mapped }) => mapped.cancelledLines > 0);
    const currentMonthOpenedLinesFallback = currentMonthOpenedRows.reduce((sum, row) => sum + row.mapped.totalLines, 0);
    const regionalMonthlyStatusRows = regionalAnalytics?.regionalData?.monthlyStatusData || [];
    const regionalSelectedMonthRow =
      regionalMonthlyStatusRows.find((row) => row.yearMonth === currentKoreanMonthKey) ||
      regionalMonthlyStatusRows[regionalMonthlyStatusRows.length - 1];
    const currentMonthOpenedLines = regionalSelectedMonthRow
      ? Math.max(Number(regionalSelectedMonthRow.openLines) || 0, 0)
      : currentMonthOpenedLinesFallback;

    return {
      inbound: inboundRows.length,
      opened: currentMonthOpenedLines,
      churned: cancelledRows.reduce((sum, row) => sum + row.mapped.cancelledLines, 0),
      changed: changedRows.length,
      totalCount: customerDbListRows.length,
      totalLines: customerDbListRows.reduce((sum, row) => sum + row.mapped.totalLines, 0),
      inboundCount: inboundRows.length,
      openedCount: currentMonthOpenedRows.length,
      churnedCount: cancelledRows.length,
      changedCount: changedRows.length,
    };
  }, [customerDbListRows, regionalAnalytics]);

  const filteredCustomerDbRows = useMemo(() => {
    return customerDbListRows.filter(({ sourceDeal, mapped }) => {
      const s = search.toLowerCase();
      const normalizedSearch = normalizeCustomerDbSearchToken(search);
      const dateSearchValues = [
        mapped.inboundDate ? formatDate(mapped.inboundDate as Date | string) : "",
        mapped.contractStartDate ? formatDate(mapped.contractStartDate as Date | string) : "",
        mapped.contractEndDate ? formatDate(mapped.contractEndDate as Date | string) : "",
        mapped.churnDate ? formatDate(mapped.churnDate as Date | string) : "",
      ];
      const matchesDateSearch =
        normalizedSearch.length > 0 &&
        dateSearchValues.some((value) => normalizeCustomerDbSearchToken(value).includes(normalizedSearch));
      const matchesSearch =
        sourceDeal.title.toLowerCase().includes(s) ||
        (sourceDeal.phone || "").toLowerCase().includes(s) ||
        String(sourceDeal.email || "").toLowerCase().includes(s) ||
        (sourceDeal.companyName || "").toLowerCase().includes(s) ||
        String(mapped.billingAccountNumber || "").toLowerCase().includes(s) ||
        (sourceDeal.industry || "").toLowerCase().includes(s) ||
        (sourceDeal.notes || "").toLowerCase().includes(s) ||
        String(mapped.contractStatus || "").toLowerCase().includes(s) ||
        String(mapped.telecomProvider || "").toLowerCase().includes(s) ||
        String(mapped.email || "").toLowerCase().includes(s) ||
        String(mapped.customerDisposition || "").toLowerCase().includes(s) ||
        String(mapped.firstProgressStatus || "").toLowerCase().includes(s) ||
        String(mapped.secondProgressStatus || "").toLowerCase().includes(s) ||
        String(mapped.additionalProgressStatus || "").toLowerCase().includes(s) ||
        String(mapped.acquisitionChannel || "").toLowerCase().includes(s) ||
        String(mapped.cancellationReason || "").toLowerCase().includes(s) ||
        String(mapped.salesperson || "").toLowerCase().includes(s) ||
        getCustomer(sourceDeal.customerId)?.name.toLowerCase().includes(s) ||
        String(getCustomer(sourceDeal.customerId)?.email || "").toLowerCase().includes(s) ||
        getCustomer(sourceDeal.customerId)?.company?.toLowerCase().includes(s) ||
        matchesDateSearch;
      const matchesStatus =
        statusFilter === "all"
          ? true
          : mapped.contractStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [customerDbListRows, search, statusFilter, customers, products, formatDate]);

  const sortedCustomerDbRows = useMemo(() => {
    const list = [...filteredCustomerDbRows];
    if (!sortField) return list;

    const compareString = (a: string, b: string) =>
      a.localeCompare(b, "ko", { numeric: true, sensitivity: "base" });

    list.sort((a, b) => {
      const mappedA = a.mapped;
      const mappedB = b.mapped;
      let compareValue = 0;

      if (sortField === "inboundDate") {
        const dateA = mappedA.inboundDate ? new Date(mappedA.inboundDate as Date | string).getTime() : Number.NaN;
        const dateB = mappedB.inboundDate ? new Date(mappedB.inboundDate as Date | string).getTime() : Number.NaN;
        const hasA = Number.isFinite(dateA);
        const hasB = Number.isFinite(dateB);
        if (!hasA && !hasB) compareValue = 0;
        else if (!hasA) compareValue = 1;
        else if (!hasB) compareValue = -1;
        else compareValue = dateA - dateB;
      } else if (sortField === "customerName") {
        compareValue = compareString(String(mappedA.customerName || ""), String(mappedB.customerName || ""));
      } else if (sortField === "telecomProvider") {
        compareValue = compareString(String(mappedA.telecomProvider || ""), String(mappedB.telecomProvider || ""));
      }

      return sortDirection === "asc" ? compareValue : -compareValue;
    });

    return list;
  }, [filteredCustomerDbRows, sortField, sortDirection]);

  const handleSort = (field: DealSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  const renderSortIcon = (field: DealSortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-muted-foreground" />;
    return sortDirection === "asc"
      ? <ArrowUp className="w-3 h-3" />
      : <ArrowDown className="w-3 h-3" />;
  };

  const totalPages = Math.ceil(sortedCustomerDbRows.length / pageSize);
  const paginatedCustomerDbRows = sortedCustomerDbRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  const selectedCustomerDbRows = customerDbListRows.filter((row) => selectedDealIds.has(row.rowId));
  const selectedDeals = Array.from(
    new Map(selectedCustomerDbRows.map((row) => [row.sourceDeal.id, row.sourceDeal])).values(),
  );
  const selectedReinstateDeals = selectedDeals.filter((deal) => isFullyChurnedDeal(deal));
  const selectedSingleDeal = selectedCustomerDbRows.length === 1 ? selectedCustomerDbRows[0].sourceDeal : undefined;
  const partialTargetDeal = selectedSingleDeal ?? selectedDeal;
  const editingRelatedDeals = useMemo(() => (editingDeal ? [editingDeal] : []), [editingDeal]);
  const currentPageDealIds = paginatedCustomerDbRows.map((row) => row.rowId);
  const isCurrentPageAllSelected =
    currentPageDealIds.length > 0 && currentPageDealIds.every((id) => selectedDealIds.has(id));

  const toggleRowSelection = (rowId: string) => {
    setSelectedDealIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const toggleCurrentPageSelection = () => {
    setSelectedDealIds((prev) => {
      const next = new Set(prev);
      if (isCurrentPageAllSelected) {
        currentPageDealIds.forEach((id) => next.delete(id));
      } else {
        currentPageDealIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleEdit = (deal: Deal) => {
    setEditingDeal(deal);
    setIsDialogOpen(true);
  };

  const handleHeaderEdit = () => {
    if (!selectedSingleDeal) {
      toast({ title: "수정할 고객 1건을 선택해주세요.", variant: "destructive" });
      return;
    }
    handleEdit(selectedSingleDeal);
  };

  const handleHeaderCopy = () => {
    if (!selectedSingleDeal) {
      toast({ title: "복사할 고객 1건을 선택해주세요.", variant: "destructive" });
      return;
    }
    const sourceDeals = [selectedSingleDeal];
    if (sourceDeals.length === 0) {
      toast({ title: "복사할 사업자 항목이 없습니다.", variant: "destructive" });
      return;
    }
    if (sourceDeals.every((item) => isFullyChurnedDeal(item))) {
      toast({ title: "해지되지 않은 사업자 항목만 복사할 수 있습니다.", variant: "destructive" });
      return;
    }
    copyMutation.mutate(sourceDeals);
  };

  const handleHeaderTerminate = () => {
    if (selectedDeals.length === 0) {
      toast({ title: "해지할 고객을 선택해주세요.", variant: "destructive" });
      return;
    }
    setTerminateTargets(selectedDeals);
    setTerminateReason("");
    setShowTerminateDialog(true);
  };

  const handleHeaderReinstate = () => {
    if (statusFilter !== "해지") {
      toast({ title: "해지철회는 해지 필터에서만 가능합니다.", variant: "destructive" });
      return;
    }
    if (selectedReinstateDeals.length === 0) {
      toast({ title: "해지철회할 해지 고객을 선택해주세요.", variant: "destructive" });
      return;
    }
    reinstateMutation.mutate(selectedReinstateDeals);
  };

  const handleHeaderPartialTerminate = () => {
    if (!partialTargetDeal) {
      toast({ title: "부분 해지할 고객 1건을 선택해주세요.", variant: "destructive" });
      return;
    }
    if (getRemainingLineCount(partialTargetDeal) < 1 || partialTargetDeal.stage === "churned") {
      toast({ title: "부분 해지 가능한 고객이 아닙니다.", variant: "destructive" });
      return;
    }
    setOpenPartialCancelFromHeader(true);
    setSelectedDeal(partialTargetDeal);
  };

  const handleHeaderAddLines = () => {
    if (!selectedSingleDeal) {
      toast({ title: "회선을 추가할 고객 1건을 선택해주세요.", variant: "destructive" });
      return;
    }
    if (isFullyChurnedDeal(selectedSingleDeal)) {
      toast({ title: "해지된 고객에는 회선을 추가할 수 없습니다.", variant: "destructive" });
      return;
    }
    setLineAddCount(1);
    setShowAddLinesDialog(true);
  };

  const handleHeaderDelete = () => {
    const ids = Array.from(new Set(selectedCustomerDbRows.map((row) => row.sourceDeal.id)));
    if (ids.length === 0) {
      toast({ title: "삭제할 고객을 선택해주세요.", variant: "destructive" });
      return;
    }
    bulkDeleteMutation.mutate(ids);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingDeal(undefined);
  };

  const isLoading = dealsLoading || customersLoading || productsLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      </div>
    );
  }

  const statCards: Array<{
    key: string;
    label: string;
    icon: typeof MapPin;
    color: string;
    bgColor: string;
    filterValue: string;
    value: string;
    subtext?: string;
  }> = [
    {
      key: "total",
      label: "총회선수",
      icon: MapPin,
      color: "text-violet-500",
      bgColor: "bg-violet-500/10",
      filterValue: "all",
      value: statusCounts.totalLines.toLocaleString(),
      subtext: `전체 ${statusCounts.totalCount.toLocaleString()}건`,
    },
    {
      key: "inbound",
      label: "인입",
      icon: UserPlus,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      filterValue: "인입",
      value: statusCounts.inbound.toLocaleString(),
    },
    {
      key: "opened",
      label: "개통",
      icon: UserCheck,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
      filterValue: "개통",
      value: statusCounts.opened.toLocaleString(),
    },
    {
      key: "churned",
      label: "해지",
      icon: UserX,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
      filterValue: "해지",
      value: statusCounts.churned.toLocaleString(),
      subtext: `전체 ${statusCounts.churnedCount.toLocaleString()}건`,
    },
    {
      key: "changed",
      label: "변경",
      icon: UserCheck,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
      filterValue: "변경",
      value: statusCounts.changed.toLocaleString(),
    },
  ];
  const addLinesTargetDeal = selectedSingleDeal;
  const addLinesTargetRow = addLinesTargetDeal ? getCustomerDbRow(addLinesTargetDeal) : null;
  const addLinesTargetRemainingLines = addLinesTargetDeal ? getRemainingLineCount(addLinesTargetDeal) : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <MapPin className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-deals-title">고객DB</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="rounded-none"
            onClick={downloadCustomerDbExcelRows}
            data-testid="button-export-customerdb"
          >
            <Download className="w-4 h-4 mr-2" />
            엑셀 내보내기
          </Button>
          <Button
            variant="outline"
            className="rounded-none"
            onClick={handleHeaderTerminate}
            disabled={selectedDeals.length === 0 || bulkTerminateMutation.isPending}
            data-testid="button-header-terminate"
          >
            해지
          </Button>
          <Button
            variant="outline"
            className="rounded-none text-blue-600 border-blue-300"
            onClick={handleHeaderReinstate}
            disabled={statusFilter !== "해지" || selectedReinstateDeals.length === 0 || reinstateMutation.isPending}
            data-testid="button-header-reinstate"
          >
            해지철회
          </Button>
          <Button
            variant="outline"
            className="rounded-none text-destructive border-destructive/30"
            onClick={handleHeaderPartialTerminate}
            disabled={!partialTargetDeal || getRemainingLineCount(partialTargetDeal) < 1 || partialTargetDeal.stage === "churned"}
            data-testid="button-header-partial-terminate"
          >
            부분해지
          </Button>
          <Button
            variant="outline"
            className="rounded-none"
            onClick={handleHeaderAddLines}
            disabled={!addLinesTargetDeal || isFullyChurnedDeal(addLinesTargetDeal) || addLinesMutation.isPending}
            data-testid="button-header-add-lines"
          >
            {addLinesMutation.isPending ? "추가 중..." : "회선추가"}
          </Button>
          <Button
            variant="outline"
            className="rounded-none"
            onClick={handleHeaderCopy}
            disabled={!selectedSingleDeal || copyMutation.isPending}
            data-testid="button-header-copy"
          >
            {copyMutation.isPending ? "복사 중..." : "복사"}
          </Button>
          <Button
            variant="outline"
            className="rounded-none"
            onClick={handleHeaderEdit}
            disabled={!selectedSingleDeal}
            data-testid="button-header-edit"
          >
            수정
          </Button>
          <Button
            variant="outline"
            className="rounded-none text-destructive border-destructive/30"
            onClick={handleHeaderDelete}
            disabled={selectedDeals.length === 0 || bulkDeleteMutation.isPending}
            data-testid="button-header-delete"
          >
            삭제
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-none" onClick={() => setEditingDeal(undefined)} data-testid="button-add-deal">
                <Plus className="w-4 h-4 mr-2" />
                고객 등록
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[1100px] rounded-none max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingDeal ? "고객 수정" : "타지역 고객 등록"}</DialogTitle>
                <DialogDescription>타지역 고객 정보를 입력해주세요.</DialogDescription>
              </DialogHeader>
              <DealForm
                deal={editingDeal}
                existingDeals={editingRelatedDeals}
                customers={customers}
                products={products}
                onSuccess={handleDialogClose}
                onCancel={handleDialogClose}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={showTerminateDialog} onOpenChange={setShowTerminateDialog}>
        <DialogContent className="sm:max-w-[520px] rounded-none">
          <DialogHeader>
            <DialogTitle>해지 처리</DialogTitle>
            <DialogDescription>
              선택한 {terminateTargets.length}건 고객을 해지 처리합니다. 해지 사유를 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="terminateReason">해지 사유</Label>
            <Input
              id="terminateReason"
              value={terminateReason}
              onChange={(e) => setTerminateReason(e.target.value)}
              placeholder="해지 사유 입력"
              className="rounded-none"
              data-testid="input-terminate-reason"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-none"
              onClick={() => {
                setShowTerminateDialog(false);
                setTerminateReason("");
                setTerminateTargets([]);
              }}
              data-testid="button-cancel-terminate"
            >
              취소
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-none"
              onClick={() => bulkTerminateMutation.mutate({ targets: terminateTargets, reason: terminateReason })}
              disabled={terminateTargets.length === 0 || bulkTerminateMutation.isPending}
              data-testid="button-confirm-terminate"
            >
              {bulkTerminateMutation.isPending ? "처리 중..." : "해지 처리"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showAddLinesDialog}
        onOpenChange={(open) => {
          setShowAddLinesDialog(open);
          if (!open) setLineAddCount(1);
        }}
      >
        <DialogContent className="sm:max-w-[460px] rounded-none">
          <DialogHeader>
            <DialogTitle>회선추가</DialogTitle>
            <DialogDescription>
              선택한 고객에 회선을 추가합니다. 추가일은 오늘로, 개통일은 주말과 공휴일을 제외한 다음 영업일로 타임라인에 기록됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-none border p-3 text-sm space-y-1">
              <div>고객명: {addLinesTargetDeal?.title || "-"}</div>
              <div>상호: {addLinesTargetDeal?.companyName || "-"}</div>
              <div>현재 총회선수: {(addLinesTargetRow?.totalLines ?? 0).toLocaleString()}회선</div>
              <div>현재 잔여 회선수: {addLinesTargetRemainingLines.toLocaleString()}회선</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lineAddCount">추가 회선수</Label>
              <Input
                id="lineAddCount"
                type="number"
                min="1"
                value={lineAddCount}
                onChange={(e) => setLineAddCount(Math.max(1, parseInt(e.target.value || "1", 10) || 1))}
                className="rounded-none"
                data-testid="input-add-line-count"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-none"
              onClick={() => {
                setShowAddLinesDialog(false);
                setLineAddCount(1);
              }}
              data-testid="button-cancel-add-lines"
            >
              취소
            </Button>
            <Button
              type="button"
              className="rounded-none"
              onClick={() => {
                if (!addLinesTargetDeal || lineAddCount < 1) return;
                addLinesMutation.mutate({ dealId: addLinesTargetDeal.id, addCount: lineAddCount });
              }}
              disabled={!addLinesTargetDeal || lineAddCount < 1 || addLinesMutation.isPending}
              data-testid="button-confirm-add-lines"
            >
              {addLinesMutation.isPending ? "처리 중..." : "회선 추가"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((stat) => (
          <Card
            key={stat.key}
            className={`rounded-none cursor-pointer ${statusFilter === stat.filterValue ? "ring-2 ring-primary" : ""}`}
            onClick={() => {
              setStatusFilter(stat.filterValue);
              setCurrentPage(1);
            }}
            data-testid={`card-stat-${stat.key}`}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                  <p className={`text-2xl font-bold ${stat.color}`} data-testid={`text-stat-count-${stat.key}`}>
                    {stat.value}
                  </p>
                  {stat.subtext && <p className="text-xs text-muted-foreground mt-0.5">{stat.subtext}</p>}
                </div>
                <div className={`w-10 h-10 rounded-none ${stat.bgColor} flex items-center justify-center`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="고객명, 청구계정번호, 업체명, 연락처, 메모 검색"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            className="pl-9 rounded-none"
            data-testid="input-search-deals"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-[160px] rounded-none" data-testid="select-filter-stage">
            <SelectValue placeholder="전체 상태" />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            {customerDbStatusFilterOptions.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground self-center whitespace-nowrap" data-testid="text-result-count">
          검색 결과 {filteredCustomerDbRows.length}건
        </span>
      </div>

            <Card className="rounded-none">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs font-medium whitespace-nowrap text-center w-10">
                    <Checkbox
                      checked={isCurrentPageAllSelected}
                      onCheckedChange={toggleCurrentPageSelection}
                      aria-label="현재 페이지 전체 선택"
                    />
                  </TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">청구계정번호</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">상호</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">업종/카테고리</TableHead>
                  <TableHead className="text-xs font-medium text-right whitespace-nowrap">총회선수</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">상태</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort("inboundDate")}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      인입일
                      {renderSortIcon("inboundDate")}
                    </button>
                  </TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">등록일</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">개통일</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">해지일</TableHead>
                  <TableHead className="text-xs font-medium text-right whitespace-nowrap">해지회선수</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort("telecomProvider")}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      통신사
                      {renderSortIcon("telecomProvider")}
                    </button>
                  </TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort("customerName")}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      고객명
                      {renderSortIcon("customerName")}
                    </button>
                  </TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">연락처</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">이메일</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">고객 성향</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">특이사항 /CS메모</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">1차 진행상황</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">2차 진행상황</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">추가 진행상황</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">유입경로</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">해지 사유</TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">영업자</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedCustomerDbRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={23} className="text-center py-8 text-muted-foreground" data-testid="text-empty-state">
                      {search || statusFilter !== "all"
                        ? "검색 결과가 없습니다"
                        : "등록된 고객DB 데이터가 없습니다"}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedCustomerDbRows.map(({ rowId, sourceDeal, mapped }) => {
                    const isMatchedUnpaid = matchedUnpaidDealIdSet.has(sourceDeal.id);
                    return (
                      <TableRow
                        key={rowId}
                        className="hover:bg-muted/20 cursor-pointer"
                        data-testid={`row-deal-${rowId}`}
                        onClick={() => {
                          setOpenPartialCancelFromHeader(false);
                          setSelectedDeal(sourceDeal);
                        }}
                      >
                        <TableCell className="text-xs whitespace-nowrap text-center" onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            checked={selectedDealIds.has(rowId)}
                            onCheckedChange={() => toggleRowSelection(rowId)}
                            aria-label={`고객 선택 ${sourceDeal.title}`}
                          />
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{mapped.billingAccountNumber || "-"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{mapped.companyName || "-"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{mapped.industry || "-"}</TableCell>
                        <TableCell className="text-xs text-right whitespace-nowrap">{mapped.totalLines.toLocaleString()}</TableCell>
                        <TableCell className={`text-xs whitespace-nowrap ${isMatchedUnpaid ? "text-red-500 font-medium" : ""}`}>
                          {mapped.contractStatus || "-"}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{mapped.inboundDate ? formatDate(mapped.inboundDate as Date | string) : "-"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{mapped.contractStartDate ? formatDate(mapped.contractStartDate as Date | string) : "-"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{mapped.contractEndDate ? formatDate(mapped.contractEndDate as Date | string) : "-"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{mapped.churnDate ? formatDate(mapped.churnDate as Date | string) : "-"}</TableCell>
                        <TableCell className="text-xs text-right whitespace-nowrap">{mapped.cancelledLines.toLocaleString()}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{mapped.telecomProvider || "-"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{mapped.customerName || "-"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{mapped.phone || "-"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{mapped.email || "-"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{mapped.customerDisposition || "-"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap max-w-[220px]">
                          <span className="block truncate" title={mapped.csMemo || ""}>{mapped.csMemo || "-"}</span>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{mapped.firstProgressStatus || "-"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{mapped.secondProgressStatus || "-"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{mapped.additionalProgressStatus || "-"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{mapped.acquisitionChannel || "-"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap max-w-[180px]">
                          <span className="block truncate" title={mapped.cancellationReason || ""}>
                            {mapped.cancellationReason || "-"}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{mapped.salesperson || "-"}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2 flex-wrap">
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
            <SelectItem value="10">10개씩 보기</SelectItem>
            <SelectItem value="20">20개씩 보기</SelectItem>
            <SelectItem value="50">50개씩 보기</SelectItem>
          </SelectContent>
        </Select>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>

      {selectedDeal && (
        <TimelineDetail
          deal={selectedDeal}
          product={getProduct(selectedDeal.productId)}
          relatedDeals={deals.filter((item) => getDealGroupKey(item) === getDealGroupKey(selectedDeal))}
          products={products}
          openPartialCancelInitially={openPartialCancelFromHeader}
          onClose={() => {
            setOpenPartialCancelFromHeader(false);
            setSelectedDeal(undefined);
          }}
        />
      )}
    </div>
  );
}








