import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomCalendar } from "@/components/custom-calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { RotateCcw, Search, Download, Filter, Calendar as CalendarIcon } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import type { Contract, KeepWithContract } from "@shared/schema";
import { getKoreanStartOfYear, getKoreanEndOfDay, isWithinKoreanDateRange } from "@/lib/korean-time";
import { useSettings } from "@/lib/settings";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCeilAmount } from "@/lib/utils";
import { matchesKoreanSearch } from "@shared/korean-search";
import { getFinancialAmountWithVat, getFinancialTargetGrossAmount } from "@/lib/contract-financials";

export default function KeepsPage() {
  const { formatDate } = useSettings();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [startDate, setStartDate] = useState<Date>(getKoreanStartOfYear());
  const [endDate, setEndDate] = useState<Date>(getKoreanEndOfDay());
  const [customerFilter, setCustomerFilter] = useState("all");
  const [createdByFilter, setCreatedByFilter] = useState("all");

  const { data: keepList = [], isLoading } = useQuery<KeepWithContract[]>({
    queryKey: ["/api/keeps"],
  });

  const { data: contracts = [] } = useQuery<Contract[]>({
    queryKey: ["/api/contracts"],
  });

  const refundFromKeepMutation = useMutation({
    mutationFn: (keepId: string) => apiRequest("POST", `/api/keeps/${keepId}/refund`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keeps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/refunds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts-with-financials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "환불관리로 이동했습니다." });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "환불관리 이동에 실패했습니다.", variant: "destructive" });
    },
  });

  const reuseKeepMutation = useMutation({
    mutationFn: (keepId: string) => apiRequest("POST", `/api/keeps/${keepId}/reuse`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keeps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts-with-financials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "적립금 재사용으로 확정했습니다." });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "적립금 재사용 확정에 실패했습니다.", variant: "destructive" });
    },
  });

  const filteredKeeps = keepList.filter((keep) => {
    const inDateRange = isWithinKoreanDateRange(keep.keepDate, startDate, endDate);
    const matchesSearch = matchesKoreanSearch(
      [
        keep.customerName,
        keep.userIdentifier,
        keep.products,
        keep.managerName,
        keep.worker,
        keep.reason,
        keep.createdBy,
        keep.keepStatus || "적립금 재사용",
        keep.decisionBy,
      ],
      searchQuery,
    );

    const matchesCustomer = customerFilter === "all" || keep.customerName === customerFilter;
    const matchesCreatedBy = createdByFilter === "all" || keep.createdBy === createdByFilter;

    return inDateRange && matchesSearch && matchesCustomer && matchesCreatedBy;
  });

  const uniqueCustomers = Array.from(new Set(keepList.map((row) => row.customerName).filter(Boolean)));
  const uniqueCreatedBy = Array.from(new Set(keepList.map((row) => row.createdBy).filter(Boolean) as string[]));

  const contractById = useMemo(() => {
    const next = new Map<string, Contract>();
    for (const contract of contracts) {
      const key = String(contract.id || "").trim();
      if (!key) continue;
      next.set(key, contract);
    }
    return next;
  }, [contracts]);

  const getKeepAmountWithVat = (keep: KeepWithContract) =>
    getFinancialAmountWithVat(contractById.get(String(keep.contractId || "").trim()), keep);

  const getKeepTargetGrossAmount = (keep: KeepWithContract) =>
    getFinancialTargetGrossAmount(contractById.get(String(keep.contractId || "").trim()), keep);

  const totalPages = Math.ceil(filteredKeeps.length / itemsPerPage);
  const paginatedKeeps = filteredKeeps.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const totalKeepAmount = filteredKeeps.reduce((sum, row) => sum + getKeepAmountWithVat(row), 0);

  const formatAmount = (amount: number) => formatCeilAmount(amount);
  const getKeepStatusLabel = (keep: KeepWithContract) => keep.keepStatus || "적립금 재사용";
  const isPendingKeep = (keep: KeepWithContract) => getKeepStatusLabel(keep) === "환불 검토";

  const handleRefundFromKeep = (keep: KeepWithContract) => {
    if (refundFromKeepMutation.isPending) return;
    const ok = window.confirm(
      `[${keep.customerName}] ${formatAmount(getKeepAmountWithVat(keep))}원을 환불관리로 보내시겠습니까?`,
    );
    if (!ok) return;
    refundFromKeepMutation.mutate(keep.id);
  };

  const handleReuseKeep = (keep: KeepWithContract) => {
    if (reuseKeepMutation.isPending) return;
    const ok = window.confirm(
      `[${keep.customerName}] ${formatAmount(getKeepAmountWithVat(keep))}원을 적립금 재사용으로 확정하시겠습니까?`,
    );
    if (!ok) return;
    reuseKeepMutation.mutate(keep.id);
  };

  const resetFilters = () => {
    setSearchQuery("");
    setCustomerFilter("all");
    setCreatedByFilter("all");
    setStartDate(getKoreanStartOfYear());
    setEndDate(getKoreanEndOfDay());
    setCurrentPage(1);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <RotateCcw className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">적립금관리</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground" data-testid="text-result-count">
            검색 결과 {filteredKeeps.length}건 | 총 관리금액 {formatAmount(totalKeepAmount)}원
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
          <Button variant="outline" className="gap-2 rounded-none" data-testid="button-excel-download">
            <Download className="w-4 h-4" />
            엑셀다운
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
          <SelectTrigger className="w-32 rounded-none" data-testid="filter-customer">
            <SelectValue placeholder="고객명" />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="all">전체</SelectItem>
            {uniqueCustomers.filter(Boolean).map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={createdByFilter} onValueChange={(v) => { setCreatedByFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-32 rounded-none" data-testid="filter-created-by">
            <SelectValue placeholder="처리자" />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="all">전체</SelectItem>
            {uniqueCreatedBy.filter(Boolean).map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-muted-foreground rounded-none"
          onClick={resetFilters}
          data-testid="button-reset-filter"
        >
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
                    <Checkbox />
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
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">작업자</th>
                  <th className="p-4 text-right font-medium text-xs whitespace-nowrap">적립금액</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">적립사유</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">확인상태</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">처리자</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">등록일</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">관리</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index} className="border-b border-border">
                      <td className="p-4"><Skeleton className="h-4 w-4" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-24" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-28" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-24" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-32" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-10" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-10" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-10" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-24" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-24" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-28" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-16" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-24" /></td>
                      <td className="p-4"><Skeleton className="h-8 w-28" /></td>
                    </tr>
                  ))
                ) : paginatedKeeps.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="p-12 text-center text-muted-foreground">
                      등록된 적립금 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  paginatedKeeps.map((keep) => (
                    <tr key={keep.id} className="border-b border-border hover:bg-muted/20 transition-colors" data-testid={`keep-row-${keep.id}`}>
                      <td className="p-4">
                        <Checkbox />
                      </td>
                      <td className="p-4 text-xs whitespace-nowrap" data-testid={`text-keep-date-${keep.id}`}>{formatDate(keep.keepDate)}</td>
                      <td className="p-4 text-xs whitespace-nowrap" data-testid={`text-keep-customer-${keep.id}`}>{keep.customerName}</td>
                      <td className="p-4 text-xs whitespace-nowrap">{keep.userIdentifier || "-"}</td>
                      <td className="p-4 text-xs text-muted-foreground max-w-[180px]">
                        <span className="truncate block">{keep.products || "-"}</span>
                      </td>
                      <td className="p-4 text-xs text-center whitespace-nowrap">{keep.days || 0}</td>
                      <td className="p-4 text-xs text-center whitespace-nowrap">{keep.addQuantity || 0}</td>
                      <td className="p-4 text-xs text-center whitespace-nowrap">{keep.extendQuantity || 0}</td>
                      <td className="p-4 text-xs font-medium text-right whitespace-nowrap">{keep.contractCost != null ? `${formatAmount(getKeepTargetGrossAmount(keep))}원` : "-"}</td>
                      <td className="p-4 text-xs whitespace-nowrap">{keep.managerName || "-"}</td>
                      <td className="p-4 text-xs whitespace-nowrap" data-testid={`text-keep-worker-${keep.id}`}>{keep.worker || "-"}</td>
                      <td className="p-4 text-xs font-medium text-blue-500 text-right whitespace-nowrap" data-testid={`text-keep-amount-${keep.id}`}>{formatAmount(getKeepAmountWithVat(keep))}원</td>
                      <td className="p-4 text-xs text-muted-foreground" data-testid={`text-keep-reason-${keep.id}`}>{keep.reason || "-"}</td>
                      <td className="p-4 text-xs whitespace-nowrap" data-testid={`text-keep-status-${keep.id}`}>
                        {getKeepStatusLabel(keep)}
                      </td>
                      <td className="p-4 text-xs whitespace-nowrap" data-testid={`text-keep-createdby-${keep.id}`}>{keep.decisionBy || keep.createdBy || "-"}</td>
                      <td className="p-4 text-xs text-muted-foreground whitespace-nowrap" data-testid={`text-keep-createdat-${keep.id}`}>{formatDate(keep.createdAt)}</td>
                      <td className="p-4 text-xs">
                        <div className="flex items-center gap-2">
                          {isPendingKeep(keep) && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-none border-blue-200 text-blue-700 hover:bg-blue-50"
                              onClick={() => handleReuseKeep(keep)}
                              disabled={reuseKeepMutation.isPending}
                              data-testid={`button-keep-reuse-${keep.id}`}
                            >
                              {reuseKeepMutation.isPending && reuseKeepMutation.variables === keep.id ? "처리중" : "재사용"}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-none border-red-200 text-red-600 hover:bg-red-50"
                            onClick={() => handleRefundFromKeep(keep)}
                            disabled={refundFromKeepMutation.isPending}
                            data-testid={`button-keep-refund-${keep.id}`}
                          >
                            {refundFromKeepMutation.isPending && refundFromKeepMutation.variables === keep.id ? "처리중" : "환불관리"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
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
            <SelectItem value="20">20개씩 보기</SelectItem>
            <SelectItem value="50">50개씩 보기</SelectItem>
          </SelectContent>
        </Select>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>
    </div>
  );
}
