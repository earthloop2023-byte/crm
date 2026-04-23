import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
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
import type { Contract, RefundWithContract } from "@shared/schema";
import { getKoreanStartOfYear, getKoreanEndOfDay, isWithinKoreanDateRange } from "@/lib/korean-time";
import { useSettings } from "@/lib/settings";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCeilAmount } from "@/lib/utils";
import { matchesKoreanSearch } from "@shared/korean-search";
import { getFinancialAmountWithVat, getFinancialTargetGrossAmount } from "@/lib/contract-financials";

export default function RefundsPage() {
  const { formatDate } = useSettings();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [startDate, setStartDate] = useState<Date>(getKoreanStartOfYear());
  const [endDate, setEndDate] = useState<Date>(getKoreanEndOfDay());
  const [customerFilter, setCustomerFilter] = useState("all");
  const [createdByFilter, setCreatedByFilter] = useState("all");
  const [refundStatusFilter, setRefundStatusFilter] = useState("all");
  const [selectedRefundIds, setSelectedRefundIds] = useState<string[]>([]);

  const { data: refundList = [], isLoading } = useQuery<RefundWithContract[]>({
    queryKey: ["/api/refunds"],
  });

  const { data: allContracts = [] } = useQuery<Contract[]>({
    queryKey: ["/api/contracts"],
  });

  const withdrawMutation = useMutation({
    mutationFn: (refundId: string) => apiRequest("DELETE", `/api/refunds/${refundId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/refunds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts-with-financials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      toast({ title: "환불이 철회되었습니다." });
    },
    onError: () => {
      toast({ title: "환불 철회에 실패했습니다.", variant: "destructive" });
    },
  });

  const completeRefundMutation = useMutation({
    mutationFn: (refundIds: string[]) =>
      apiRequest("PUT", "/api/refunds/bulk/status", {
        ids: refundIds,
        refundStatus: "환불완료",
      }),
    onSuccess: (_data, refundIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/refunds"] });
      setSelectedRefundIds((prev) => prev.filter((id) => !refundIds.includes(id)));
      toast({ title: `${refundIds.length}건을 환불 완료 처리했습니다.` });
    },
    onError: () => {
      toast({ title: "환불 완료 처리에 실패했습니다.", variant: "destructive" });
    },
  });

  const requestRefundMutation = useMutation({
    mutationFn: (refundIds: string[]) =>
      apiRequest("PUT", "/api/refunds/bulk/status", {
        ids: refundIds,
        refundStatus: "환불요청",
      }),
    onSuccess: (_data, refundIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/refunds"] });
      setSelectedRefundIds((prev) => prev.filter((id) => !refundIds.includes(id)));
      toast({ title: `${refundIds.length}건을 환불요청 처리했습니다.` });
    },
    onError: () => {
      toast({ title: "환불요청 처리에 실패했습니다.", variant: "destructive" });
    },
  });

  const filteredRefunds = refundList.filter((refund) => {
    const inDateRange = isWithinKoreanDateRange(refund.refundDate, startDate, endDate);
    const matchesSearch = matchesKoreanSearch(
      [
        refund.customerName,
        refund.userIdentifier,
        refund.products,
        refund.managerName,
        refund.worker,
        refund.reason,
        refund.createdBy,
      ],
      searchQuery,
    );

    const matchesCustomer = customerFilter === "all" || refund.customerName === customerFilter;
    const matchesCreatedBy = createdByFilter === "all" || refund.createdBy === createdByFilter;
    const matchesRefundStatus = refundStatusFilter === "all" || refund.refundStatus === refundStatusFilter;

    return inDateRange && matchesSearch && matchesCustomer && matchesCreatedBy && matchesRefundStatus;
  });

  const uniqueCustomers = Array.from(new Set(refundList.map((row) => row.customerName).filter(Boolean)));
  const uniqueCreatedBy = Array.from(new Set(refundList.map((row) => row.createdBy).filter(Boolean) as string[]));

  const totalPages = Math.ceil(filteredRefunds.length / itemsPerPage);
  const paginatedRefunds = filteredRefunds.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const paginatedRefundIds = paginatedRefunds.map((refund) => refund.id);
  const isAllPaginatedSelected =
    paginatedRefundIds.length > 0 && paginatedRefundIds.every((refundId) => selectedRefundIds.includes(refundId));
  const isSomePaginatedSelected = paginatedRefundIds.some((refundId) => selectedRefundIds.includes(refundId));

  const contractById = useMemo(
    () => new Map(allContracts.map((contract) => [String(contract.id), contract])),
    [allContracts],
  );

  const getRefundGrossAmount = (refund: RefundWithContract) =>
    getFinancialAmountWithVat(contractById.get(String(refund.contractId || "")), refund);

  const getRefundTargetGrossAmountValue = (refund: RefundWithContract) => {
    const contract = contractById.get(String(refund.contractId || ""));
    const grossTarget = getFinancialTargetGrossAmount(contract, refund);
    return grossTarget > 0 ? grossTarget : Math.max(Number(refund.contractCost) || 0, 0);
  };

  const totalRefundAmount = filteredRefunds.reduce((sum, row) => sum + getRefundGrossAmount(row), 0);

  const formatAmount = (amount: number) => formatCeilAmount(amount);
  const getRefundStatusLabel = (status: string | null | undefined) => status || "-";
  const getRefundStatusClassName = (status: string | null | undefined) =>
    status === "환불완료"
      ? "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
      : status === "환불요청"
        ? "inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700"
        : status === "환불대기"
        ? "inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
        : status === "상계처리"
          ? "inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700"
        : "inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground";

  const resetFilters = () => {
    setSearchQuery("");
    setCustomerFilter("all");
    setCreatedByFilter("all");
    setRefundStatusFilter("all");
    setStartDate(getKoreanStartOfYear());
    setEndDate(getKoreanEndOfDay());
    setCurrentPage(1);
    setSelectedRefundIds([]);
  };

  useEffect(() => {
    const visibleRefundIdSet = new Set(filteredRefunds.map((refund) => refund.id));
    setSelectedRefundIds((prev) => {
      const next = prev.filter((refundId) => visibleRefundIdSet.has(refundId));
      return next.length === prev.length ? prev : next;
    });
  }, [filteredRefunds]);

  const toggleRefundSelection = (refundId: string, checked?: boolean | "indeterminate") => {
    setSelectedRefundIds((prev) => {
      const shouldSelect = checked === undefined ? !prev.includes(refundId) : checked !== false;
      if (shouldSelect) {
        return prev.includes(refundId) ? prev : [...prev, refundId];
      }
      return prev.filter((id) => id !== refundId);
    });
  };

  const togglePaginatedRefundSelection = (checked?: boolean | "indeterminate") => {
    const visibleRefundIdSet = new Set(paginatedRefundIds);
    const shouldSelect = checked === undefined ? !isAllPaginatedSelected : checked !== false;

    setSelectedRefundIds((prev) => {
      if (!shouldSelect) {
        return prev.filter((refundId) => !visibleRefundIdSet.has(refundId));
      }
      return Array.from(new Set([...prev, ...paginatedRefundIds]));
    });
  };

  const handleCompleteSelectedRefunds = () => {
    if (completeRefundMutation.isPending) return;

    if (selectedRefundIds.length === 0) {
      toast({ title: "환불 완료 처리할 항목을 선택해주세요.", variant: "destructive" });
      return;
    }

    const selectedRefunds = filteredRefunds.filter((refund) => selectedRefundIds.includes(refund.id));
    const pendingRefundIds = selectedRefunds
      .filter((refund) => refund.refundStatus !== "환불완료")
      .map((refund) => refund.id);

    if (pendingRefundIds.length === 0) {
      toast({ title: "선택한 환불은 이미 환불 완료 상태입니다." });
      return;
    }

    const ok = window.confirm(`선택한 ${pendingRefundIds.length}건을 환불 완료 처리하시겠습니까?`);
    if (!ok) return;

    completeRefundMutation.mutate(pendingRefundIds);
  };

  const handleRequestSelectedRefunds = () => {
    if (requestRefundMutation.isPending) return;

    if (selectedRefundIds.length === 0) {
      toast({ title: "환불요청 처리할 항목을 선택해주세요.", variant: "destructive" });
      return;
    }

    const selectedRefunds = filteredRefunds.filter((refund) => selectedRefundIds.includes(refund.id));
    const requestableRefundIds = selectedRefunds
      .filter((refund) => refund.refundStatus !== "환불요청")
      .map((refund) => refund.id);

    if (requestableRefundIds.length === 0) {
      toast({ title: "선택한 환불은 이미 환불요청 상태입니다." });
      return;
    }

    const ok = window.confirm(`선택한 ${requestableRefundIds.length}건을 환불요청 처리하시겠습니까?`);
    if (!ok) return;

    requestRefundMutation.mutate(requestableRefundIds);
  };

  const handleWithdraw = (refund: RefundWithContract) => {
    if (withdrawMutation.isPending) return;

    const ok = window.confirm(
      `[${refund.customerName}] 환불 ${formatAmount(getRefundGrossAmount(refund))}원을 철회하시겠습니까?`,
    );
    if (!ok) return;

    withdrawMutation.mutate(refund.id);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <RotateCcw className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">환불관리</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground" data-testid="text-result-count">
            검색 결과 {filteredRefunds.length}건 | 총 환불금액 {formatAmount(totalRefundAmount)}원
          </span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="고객명, 사용자ID, 상품, 담당자 검색"
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
        <Select value={refundStatusFilter} onValueChange={(v) => { setRefundStatusFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-36 rounded-none" data-testid="filter-refund-status">
            <SelectValue placeholder="환불상태" />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="환불대기">환불대기</SelectItem>
            <SelectItem value="환불요청">환불요청</SelectItem>
            <SelectItem value="환불완료">환불완료</SelectItem>
            <SelectItem value="상계처리">상계처리</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-none border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
            onClick={handleRequestSelectedRefunds}
            disabled={selectedRefundIds.length === 0 || requestRefundMutation.isPending}
            data-testid="button-request-selected-refunds"
          >
            {requestRefundMutation.isPending
              ? "처리 중..."
              : `환불요청${selectedRefundIds.length > 0 ? ` (${selectedRefundIds.length})` : ""}`}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-none border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            onClick={handleCompleteSelectedRefunds}
            disabled={selectedRefundIds.length === 0 || completeRefundMutation.isPending}
            data-testid="button-complete-selected-refunds"
          >
            {completeRefundMutation.isPending
              ? "처리 중..."
              : `환불완료 처리${selectedRefundIds.length > 0 ? ` (${selectedRefundIds.length})` : ""}`}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground rounded-none"
            onClick={resetFilters}
            data-testid="button-reset-filter"
          >
            초기화
          </Button>
        </div>
      </div>

      <Card className="rounded-none">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">
                    <Checkbox
                      checked={isAllPaginatedSelected ? true : isSomePaginatedSelected ? "indeterminate" : false}
                      onCheckedChange={togglePaginatedRefundSelection}
                      data-testid="checkbox-select-all-refunds"
                    />
                  </th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">환불 신청일</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">슬롯 신청일</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">고객명</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">사용자ID</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">신청 상품</th>
                  <th className="p-4 text-center font-medium text-xs whitespace-nowrap">일수</th>
                  <th className="p-4 text-center font-medium text-xs whitespace-nowrap">추가</th>
                  <th className="p-4 text-center font-medium text-xs whitespace-nowrap">연장</th>
                  <th className="p-4 text-right font-medium text-xs whitespace-nowrap">공급가</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">담당자</th>
                  <th className="p-4 text-right font-medium text-xs whitespace-nowrap">환불개수</th>
                  <th className="p-4 text-right font-medium text-xs whitespace-nowrap">환불일수</th>
                  <th className="p-4 text-right font-medium text-xs whitespace-nowrap">환불금액</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">환불상태</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">환불사유</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">처리자</th>
                  <th className="p-4 text-left font-medium text-xs whitespace-nowrap">관리</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index} className="border-b border-border">
                      <td className="p-4"><Skeleton className="h-4 w-4" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-24" /></td>
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
                      <td className="p-4"><Skeleton className="h-4 w-12" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-12" /></td>
                      <td className="p-4"><Skeleton className="h-5 w-16" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-16" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-32" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-16" /></td>
                      <td className="p-4"><Skeleton className="h-8 w-16" /></td>
                    </tr>
                  ))
                ) : paginatedRefunds.length === 0 ? (
                  <tr>
                    <td colSpan={18} className="p-12 text-center text-muted-foreground">
                      등록된 환불 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  paginatedRefunds.map((refund) => {
                    const isWithdrawing = withdrawMutation.isPending && withdrawMutation.variables === refund.id;

                    return (
                      <tr key={refund.id} className="border-b border-border hover:bg-muted/20 transition-colors" data-testid={`refund-row-${refund.id}`}>
                        <td className="p-4">
                          <Checkbox
                            checked={selectedRefundIds.includes(refund.id)}
                            onCheckedChange={(checked) => toggleRefundSelection(refund.id, checked)}
                            data-testid={`checkbox-refund-${refund.id}`}
                          />
                        </td>
                        <td className="p-4 text-xs font-medium text-red-600 whitespace-nowrap" data-testid={`text-refund-createdat-${refund.id}`}>{formatDate(refund.refundDate)}</td>
                        <td className="p-4 text-xs whitespace-nowrap" data-testid={`text-refund-date-${refund.id}`}>{formatDate(refund.contractDate || refund.refundDate)}</td>
                        <td className="p-4 text-xs whitespace-nowrap" data-testid={`text-refund-customer-${refund.id}`}>{refund.customerName}</td>
                        <td className="p-4 text-xs whitespace-nowrap">{refund.userIdentifier || "-"}</td>
                        <td className="p-4 text-xs text-muted-foreground max-w-[180px]">
                          <span className="truncate block">{refund.products || "-"}</span>
                        </td>
                        <td className="p-4 text-xs text-center whitespace-nowrap">{refund.days || 0}</td>
                        <td className="p-4 text-xs text-center whitespace-nowrap">{refund.addQuantity || 0}</td>
                        <td className="p-4 text-xs text-center whitespace-nowrap">{refund.extendQuantity || 0}</td>
                        <td className="p-4 text-xs font-medium text-right whitespace-nowrap">{`${formatAmount(getRefundTargetGrossAmountValue(refund))}원`}</td>
                        <td className="p-4 text-xs whitespace-nowrap">{refund.managerName || "-"}</td>
                        <td className="p-4 text-xs text-right whitespace-nowrap" data-testid={`text-refund-quantity-${refund.id}`}>{refund.quantity || 0}</td>
                        <td className="p-4 text-xs text-right whitespace-nowrap" data-testid={`text-refund-days-${refund.id}`}>{refund.refundDays || 0}</td>
                        <td className="p-4 text-xs font-medium text-red-500 text-right whitespace-nowrap" data-testid={`text-refund-amount-${refund.id}`}>-{formatAmount(getRefundGrossAmount(refund))}원</td>
                        <td className="p-4 text-xs whitespace-nowrap" data-testid={`text-refund-status-${refund.id}`}>
                          <span className={getRefundStatusClassName(refund.refundStatus)}>
                            {getRefundStatusLabel(refund.refundStatus)}
                          </span>
                        </td>
                        <td className="p-4 text-xs text-muted-foreground" data-testid={`text-refund-reason-${refund.id}`}>{refund.reason || "-"}</td>
                        <td className="p-4 text-xs whitespace-nowrap" data-testid={`text-refund-createdby-${refund.id}`}>{refund.createdBy || "-"}</td>
                        <td className="p-4 text-xs">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-none border-red-200 text-red-600 hover:bg-red-50"
                            onClick={() => handleWithdraw(refund)}
                            disabled={isWithdrawing}
                            data-testid={`button-refund-withdraw-${refund.id}`}
                          >
                            {isWithdrawing ? "철회중" : "철회"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })
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
