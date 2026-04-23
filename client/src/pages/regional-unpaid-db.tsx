import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

type RegionalUnpaidMonthItem = {
  label: string;
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
};

type RegionalUnpaidEntry = {
  rowId: string;
  billingAccountNumber: string;
  status: string;
  unpaidTotalAmount: number;
  paidTotalAmount: number;
  remainingAmount: number;
  monthItems: RegionalUnpaidMonthItem[];
  customerName: string;
  companyName: string;
  phone: string;
  contractStatus: string;
  totalLines: number;
  unpaidCycle: string;
  targetGuide: string;
  matchedDealId: string | null;
};

type RegionalUnpaidSummary = {
  unpaidCount: number;
  partialPaidCount: number;
  paidCompleteCount: number;
  totalUnpaidAmount: number;
  totalPaidAmount: number;
  totalRemainingAmount: number;
};

type RegionalUnpaidResponse = {
  entries: RegionalUnpaidEntry[];
  summary: RegionalUnpaidSummary;
  importedCount: number;
  excludedCount: number;
  uploadedAt: string | null;
  uploadedBy: string | null;
};

type SettleFormItem = {
  label: string;
  remainingAmount: number;
  checked: boolean;
  amount: string;
};

const EMPTY_SUMMARY: RegionalUnpaidSummary = {
  unpaidCount: 0,
  partialPaidCount: 0,
  paidCompleteCount: 0,
  totalUnpaidAmount: 0,
  totalPaidAmount: 0,
  totalRemainingAmount: 0,
};

const EMPTY_DATA: RegionalUnpaidResponse = {
  entries: [],
  summary: EMPTY_SUMMARY,
  importedCount: 0,
  excludedCount: 0,
  uploadedAt: null,
  uploadedBy: null,
};

function formatAmount(value: number): string {
  return `${(Number(value) || 0).toLocaleString()}원`;
}

function getStatusTextClass(status: string): string {
  if (status === "미납금 납부완료") return "text-emerald-600";
  if (status === "부분 납부완료") return "text-blue-600";
  return "text-red-500";
}

async function parseApiError(res: Response, fallbackMessage: string): Promise<string> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await res.json().catch(() => null as { error?: string } | null);
    if (payload?.error) return String(payload.error);
  }

  const text = await res.text().catch(() => "");
  const compact = text.trim().toLowerCase();
  if (compact.startsWith("<!doctype") || compact.startsWith("<html")) {
    return "API 응답이 JSON이 아닙니다. 백엔드(5001) 연결 상태를 확인해주세요.";
  }
  return text || fallbackMessage;
}

export default function RegionalUnpaidDbPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [isSettleDialogOpen, setIsSettleDialogOpen] = useState(false);
  const [settleItems, setSettleItems] = useState<SettleFormItem[]>([]);
  const [totalSettleAmountInput, setTotalSettleAmountInput] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const { data = EMPTY_DATA, isLoading } = useQuery<RegionalUnpaidResponse>({
    queryKey: ["/api/regional-unpaids?matchedOnly=true"],
  });

  const settleMutation = useMutation({
    mutationFn: async (payload: { rowId: string; items: Array<{ label: string; amount: number }> }) => {
      const res = await fetch("/api/regional-unpaids/settle", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res, "미납 납부완료 처리에 실패했습니다."));
      }
      return res.json() as Promise<{ status: string; appliedTotal: number; remainingAmount: number }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/regional-unpaids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/regional-unpaids?matchedOnly=true"] });
      setIsSettleDialogOpen(false);
      setSettleItems([]);
      setTotalSettleAmountInput("");
      setSelectedRowIds(new Set());
      toast({
        title: `처리 완료: ${formatAmount(result.appliedTotal)} 반영 / 상태 ${result.status}`,
      });
    },
    onError: (error) => {
      toast({
        title: error instanceof Error ? error.message : "미납 납부완료 처리에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const revertMutation = useMutation({
    mutationFn: async (payload: { rowId: string }) => {
      const res = await fetch("/api/regional-unpaids/revert", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res, "납부 철회 처리에 실패했습니다."));
      }
      return res.json() as Promise<{ status: string; revertedAmount: number; remainingAmount: number }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/regional-unpaids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/regional-unpaids?matchedOnly=true"] });
      setSelectedRowIds(new Set());
      toast({
        title: `납부철회 완료: ${formatAmount(result.revertedAmount)} 복원 / 상태 ${result.status}`,
      });
    },
    onError: (error) => {
      toast({
        title: error instanceof Error ? error.message : "납부 철회 처리에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (payload: { rowIds: string[] }) => {
      const res = await fetch("/api/regional-unpaids/delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res, "미납 항목 삭제에 실패했습니다."));
      }
      return res.json() as Promise<{ deletedCount: number; remainingCount: number }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/regional-unpaids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/regional-unpaids?matchedOnly=true"] });
      setSelectedRowIds(new Set());
      toast({
        title: `삭제 완료: ${result.deletedCount}건 삭제`,
      });
    },
    onError: (error) => {
      toast({
        title: error instanceof Error ? error.message : "미납 항목 삭제에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return data.entries;
    return data.entries.filter((entry) =>
      [
        entry.status,
        entry.billingAccountNumber,
        entry.customerName,
        entry.companyName,
        entry.phone,
        entry.contractStatus,
        entry.unpaidCycle,
        entry.targetGuide,
        String(entry.unpaidTotalAmount),
        String(entry.paidTotalAmount),
        String(entry.remainingAmount),
      ].some((value) => String(value || "").toLowerCase().includes(q)),
    );
  }, [data.entries, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / itemsPerPage));
  const currentRows = filteredEntries.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const currentPageRowIds = currentRows.map((entry) => entry.rowId);
  const isCurrentPageAllSelected =
    currentPageRowIds.length > 0 && currentPageRowIds.every((rowId) => selectedRowIds.has(rowId));

  const selectedEntries = useMemo(
    () => data.entries.filter((entry) => selectedRowIds.has(entry.rowId)),
    [data.entries, selectedRowIds],
  );
  const settleTarget = selectedEntries.length === 1 ? selectedEntries[0] : undefined;

  useEffect(() => {
    setSelectedRowIds((prev) => {
      const validIds = new Set(data.entries.map((entry) => entry.rowId));
      const next = new Set(Array.from(prev).filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [data.entries]);

  useEffect(() => {
    if (!isSettleDialogOpen || !settleTarget) return;
    const monthItems = (settleTarget.monthItems || []).filter((item) => (item.remainingAmount || 0) > 0);
    const fallbackItems =
      monthItems.length > 0
        ? monthItems
        : [
            {
              label: "미납금액",
              originalAmount: settleTarget.unpaidTotalAmount,
              paidAmount: settleTarget.paidTotalAmount,
              remainingAmount: settleTarget.remainingAmount,
            },
          ];
    setSettleItems(
      fallbackItems.map((item) => ({
        label: item.label,
        remainingAmount: Math.max(Number(item.remainingAmount) || 0, 0),
        checked: false,
        amount: String(Math.max(Number(item.remainingAmount) || 0, 0)),
      })),
    );
    setTotalSettleAmountInput("");
  }, [isSettleDialogOpen, settleTarget]);

  const settlePayloadPreview = useMemo(() => {
    const explicitMap = new Map<string, number>();
    settleItems.forEach((item) => {
      if (!item.checked) return;
      const amount = Number(item.amount);
      if (!Number.isFinite(amount) || amount <= 0) return;
      const apply = Math.min(amount, item.remainingAmount);
      if (apply <= 0) return;
      explicitMap.set(item.label, (explicitMap.get(item.label) || 0) + apply);
    });

    let remainingTotalInput = Math.max(Number(totalSettleAmountInput) || 0, 0);
    if (remainingTotalInput > 0) {
      const hasChecked = settleItems.some((item) => item.checked);
      const targets = hasChecked ? settleItems.filter((item) => item.checked) : settleItems;
      targets.forEach((item) => {
        if (remainingTotalInput <= 0) return;
        const alreadyApplied = explicitMap.get(item.label) || 0;
        const rowRemaining = Math.max(item.remainingAmount - alreadyApplied, 0);
        if (rowRemaining <= 0) return;
        const distribute = Math.min(rowRemaining, remainingTotalInput);
        explicitMap.set(item.label, alreadyApplied + distribute);
        remainingTotalInput -= distribute;
      });
    }

    const items = Array.from(explicitMap.entries())
      .map(([label, amount]) => ({ label, amount }))
      .filter((item) => item.amount > 0);
    const appliedTotal = items.reduce((sum, item) => sum + item.amount, 0);

    return {
      items,
      appliedTotal,
      unusedTotalAmount: remainingTotalInput,
    };
  }, [settleItems, totalSettleAmountInput]);

  const toggleRowSelection = (rowId: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const toggleCurrentPageSelection = () => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (isCurrentPageAllSelected) currentPageRowIds.forEach((id) => next.delete(id));
      else currentPageRowIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const openSettleDialog = () => {
    if (!settleTarget) {
      toast({ title: "미납완료 처리할 항목 1건을 선택해주세요.", variant: "destructive" });
      return;
    }
    if ((settleTarget.remainingAmount || 0) <= 0) {
      toast({ title: "이미 미납금이 모두 납부완료된 항목입니다.", variant: "destructive" });
      return;
    }
    setIsSettleDialogOpen(true);
  };

  const handleRevertSubmit = () => {
    if (!settleTarget) {
      toast({ title: "납부철회할 항목 1건을 선택해주세요.", variant: "destructive" });
      return;
    }
    if ((settleTarget.status || "").trim() === "미납") {
      toast({ title: "이미 미납 상태입니다.", variant: "destructive" });
      return;
    }
    revertMutation.mutate({ rowId: settleTarget.rowId });
  };

  const handleSettleSubmit = () => {
    if (!settleTarget) return;
    const { items } = settlePayloadPreview;

    if (items.length === 0) {
      toast({ title: "월수 항목을 체크하고 납부 금액을 입력해주세요.", variant: "destructive" });
      return;
    }

    settleMutation.mutate({ rowId: settleTarget.rowId, items });
  };

  const handleDeleteSubmit = () => {
    if (selectedEntries.length === 0) {
      toast({ title: "삭제할 항목을 1건 이상 선택해주세요.", variant: "destructive" });
      return;
    }

    const confirmed = window.confirm(
      `선택한 ${selectedEntries.length}건을 삭제하시겠습니까?\n삭제하면 미납DB와 미납 페이지에서 함께 사라집니다.`,
    );
    if (!confirmed) return;

    deleteMutation.mutate({ rowIds: selectedEntries.map((entry) => entry.rowId) });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-500" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            미납DB
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="청구계정번호/고객명/상호 검색"
              className="pl-9 w-72 rounded-none"
              data-testid="input-regional-unpaid-db-search"
            />
          </div>

          <Button
            variant="outline"
            className="rounded-none"
            onClick={openSettleDialog}
            disabled={selectedEntries.length !== 1}
            data-testid="button-open-settle-dialog"
          >
            미납완료
          </Button>
          <Button
            variant="outline"
            className="rounded-none"
            onClick={handleRevertSubmit}
            disabled={selectedEntries.length !== 1 || (settleTarget?.status || "").trim() === "미납" || revertMutation.isPending}
            data-testid="button-open-revert-dialog"
          >
            {revertMutation.isPending ? "철회 중..." : "납부철회"}
          </Button>
          <Button
            variant="destructive"
            className="rounded-none"
            onClick={handleDeleteSubmit}
            disabled={selectedEntries.length === 0 || deleteMutation.isPending}
            data-testid="button-delete-regional-unpaid"
          >
            {deleteMutation.isPending ? "삭제 중..." : "삭제"}
          </Button>
        </div>
      </div>

      <Card className="rounded-none">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="space-y-1">
            <div>미납: <span className="font-semibold text-red-500">{data.summary.unpaidCount}건</span></div>
            <div>부분 납부완료: <span className="font-semibold text-blue-600">{data.summary.partialPaidCount}건</span></div>
            <div>미납금 납부완료: <span className="font-semibold text-emerald-600">{data.summary.paidCompleteCount}건</span></div>
          </div>
          <div className="space-y-1">
            <div>총 미납금액: <span className="font-semibold">{formatAmount(data.summary.totalUnpaidAmount)}</span></div>
            <div>납부완료 금액: <span className="font-semibold text-blue-600">{formatAmount(data.summary.totalPaidAmount)}</span></div>
            <div>잔여 미납금액: <span className="font-semibold text-red-500">{formatAmount(data.summary.totalRemainingAmount)}</span></div>
          </div>
          <div className="space-y-1 text-muted-foreground">
            <div>미납 원본 반영 건수: {data.importedCount}건</div>
            <div>매칭 대상 제외 건수: {data.excludedCount}건</div>
            <div>
              마지막 업로드: {data.uploadedAt ? new Date(data.uploadedAt).toLocaleString("ko-KR") : "-"}
              {data.uploadedBy ? ` / 업로더: ${data.uploadedBy}` : ""}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-none">
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">
                    <Checkbox
                      checked={isCurrentPageAllSelected}
                      onCheckedChange={toggleCurrentPageSelection}
                      aria-label="현재 페이지 전체 선택"
                    />
                  </TableHead>
                  <TableHead className="whitespace-nowrap">상태</TableHead>
                  <TableHead className="whitespace-nowrap">청구계정번호</TableHead>
                  <TableHead className="whitespace-nowrap">고객명</TableHead>
                  <TableHead className="whitespace-nowrap">상호</TableHead>
                  <TableHead className="whitespace-nowrap">계약상태</TableHead>
                  <TableHead className="whitespace-nowrap">연락처</TableHead>
                  <TableHead className="whitespace-nowrap text-right">미납 총금액</TableHead>
                  <TableHead className="whitespace-nowrap text-right">납부완료 금액</TableHead>
                  <TableHead className="whitespace-nowrap text-right">잔여 미납금액</TableHead>
                  <TableHead className="whitespace-nowrap">미납회차</TableHead>
                  <TableHead className="whitespace-nowrap">대상안내</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell colSpan={12}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : currentRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-10 text-muted-foreground">
                      청구계정번호 기준으로 매칭된 미납DB 데이터가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  currentRows.map((entry) => (
                    <TableRow key={entry.rowId}>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={selectedRowIds.has(entry.rowId)}
                          onCheckedChange={() => toggleRowSelection(entry.rowId)}
                          aria-label={`미납 항목 선택 ${entry.billingAccountNumber}`}
                        />
                      </TableCell>
                      <TableCell className={`whitespace-nowrap font-medium ${getStatusTextClass(entry.status)}`}>
                        {entry.status}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{entry.billingAccountNumber || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">{entry.customerName || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">{entry.companyName || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-red-500 font-medium">{entry.contractStatus || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">{entry.phone || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{formatAmount(entry.unpaidTotalAmount)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right text-blue-600">{formatAmount(entry.paidTotalAmount)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right text-red-500">{formatAmount(entry.remainingAmount)}</TableCell>
                      <TableCell className="whitespace-nowrap">{entry.unpaidCycle || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">{entry.targetGuide || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">총 {filteredEntries.length}건</span>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>

      <Dialog open={isSettleDialogOpen} onOpenChange={setIsSettleDialogOpen}>
        <DialogContent className="sm:max-w-[680px] rounded-none">
          <DialogHeader>
            <DialogTitle>미납 납부완료 처리</DialogTitle>
            <DialogDescription>
              월수 항목을 체크하고 납부 금액을 입력한 뒤, 미납납부완료를 눌러주세요.
            </DialogDescription>
          </DialogHeader>

          {settleTarget && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="border p-3 rounded-none">
                  <div className="text-muted-foreground">미납 총금액</div>
                  <div className="font-semibold">{formatAmount(settleTarget.unpaidTotalAmount)}</div>
                </div>
                <div className="border p-3 rounded-none">
                  <div className="text-muted-foreground">기납부 금액</div>
                  <div className="font-semibold text-blue-600">{formatAmount(settleTarget.paidTotalAmount)}</div>
                </div>
                <div className="border p-3 rounded-none">
                  <div className="text-muted-foreground">잔여 미납금액</div>
                  <div className="font-semibold text-red-500">{formatAmount(settleTarget.remainingAmount)}</div>
                </div>
              </div>

              <div className="border rounded-none max-h-[260px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">선택</TableHead>
                      <TableHead>월수 기준</TableHead>
                      <TableHead className="text-right">잔여 금액</TableHead>
                      <TableHead className="text-right">납부 입력금액</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settleItems.map((item, index) => (
                      <TableRow key={`${item.label}-${index}`}>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={item.checked}
                            onCheckedChange={(checked) => {
                              setSettleItems((prev) => prev.map((entry, i) => (i === index ? { ...entry, checked: checked === true } : entry)));
                            }}
                            aria-label={`${item.label} 선택`}
                          />
                        </TableCell>
                        <TableCell>{item.label}</TableCell>
                        <TableCell className="text-right">{formatAmount(item.remainingAmount)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              min={0}
                              max={item.remainingAmount}
                              value={item.amount}
                              onChange={(event) => {
                                const value = event.target.value;
                                setSettleItems((prev) => prev.map((entry, i) => (i === index ? { ...entry, amount: value } : entry)));
                              }}
                              className="w-28 h-8 text-right rounded-none"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-none"
                              onClick={() => {
                                setSettleItems((prev) =>
                                  prev.map((entry, i) =>
                                    i === index ? { ...entry, amount: String(entry.remainingAmount), checked: true } : entry,
                                  ),
                                );
                              }}
                            >
                              전액
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="border rounded-none p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">총 납부 금액(직접 입력)</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-none"
                    onClick={() => setTotalSettleAmountInput(String(Math.max(settleTarget.remainingAmount || 0, 0)))}
                  >
                    잔여 전액
                  </Button>
                </div>
                <Input
                  type="number"
                  min={0}
                  value={totalSettleAmountInput}
                  onChange={(event) => setTotalSettleAmountInput(event.target.value)}
                  className="w-full rounded-none text-right"
                  placeholder="0"
                />
                <div className="text-xs text-muted-foreground">
                  월수 체크가 없으면 전체 월수에서 순차 차감됩니다.
                </div>
                {settlePayloadPreview.unusedTotalAmount > 0 && (
                  <div className="text-xs text-red-500">
                    입력한 금액 중 {formatAmount(settlePayloadPreview.unusedTotalAmount)} 은(는) 반영되지 않았습니다.
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-sm border-t pt-3">
                <span className="text-muted-foreground">선택 납부 합계</span>
                <span className="font-semibold">{formatAmount(settlePayloadPreview.appliedTotal)}</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" className="rounded-none" onClick={() => setIsSettleDialogOpen(false)} type="button">
              취소
            </Button>
            <Button
              className="rounded-none"
              onClick={handleSettleSubmit}
              disabled={!settleTarget || settleMutation.isPending}
              type="button"
            >
              {settleMutation.isPending ? "처리 중..." : "미납납부완료"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

