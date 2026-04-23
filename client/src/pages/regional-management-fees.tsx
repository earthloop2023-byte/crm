import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, Pencil, Plus, Search, Trash2, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/pagination";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { RegionalManagementFee } from "@shared/schema";

type RegionalManagementFeeResponse = {
  items: RegionalManagementFee[];
  totalAmount: number;
  totalCount: number;
};

const EMPTY_DATA: RegionalManagementFeeResponse = {
  items: [],
  totalAmount: 0,
  totalCount: 0,
};

function formatAmount(value: number) {
  return `${(Number(value) || 0).toLocaleString()}원`;
}

function toDateInputValue(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR");
}

function formatDateOnly(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR");
}

export default function RegionalManagementFeesPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RegionalManagementFee | null>(null);
  const [feeDate, setFeeDate] = useState("");
  const [productName, setProductName] = useState("");
  const [amount, setAmount] = useState("");
  const itemsPerPage = 20;

  const { data = EMPTY_DATA, isLoading } = useQuery<RegionalManagementFeeResponse>({
    queryKey: ["/api/regional-management-fees"],
  });

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return data.items;
    return data.items.filter((item) =>
      [
        item.productName,
        item.createdBy,
        item.updatedBy,
        String(item.amount),
        toDateInputValue(item.feeDate),
      ].some((value) => String(value || "").toLowerCase().includes(query)),
    );
  }, [data.items, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / itemsPerPage));
  const currentRows = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const resetForm = () => {
    setEditingItem(null);
    setFeeDate("");
    setProductName("");
    setAmount("");
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (item: RegionalManagementFee) => {
    setEditingItem(item);
    setFeeDate(toDateInputValue(item.feeDate));
    setProductName(item.productName || "");
    setAmount(String(item.amount || 0));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        feeDate,
        productName: productName.trim(),
        amount: Math.max(Number(amount) || 0, 0),
      };

      if (editingItem) {
        const res = await apiRequest("PUT", `/api/regional-management-fees/${editingItem.id}`, payload);
        return res.json();
      }

      const res = await apiRequest("POST", "/api/regional-management-fees", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/regional-management-fees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-analytics"] });
      toast({ title: editingItem ? "관리비를 수정했습니다." : "관리비를 등록했습니다." });
      closeDialog();
    },
    onError: (error) => {
      toast({
        title: error instanceof Error ? error.message : "관리비 저장에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/regional-management-fees/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/regional-management-fees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-analytics"] });
      toast({ title: "관리비를 삭제했습니다." });
    },
    onError: (error) => {
      toast({
        title: error instanceof Error ? error.message : "관리비 삭제에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!feeDate) {
      toast({ title: "일자를 입력해주세요.", variant: "destructive" });
      return;
    }
    if (!productName.trim()) {
      toast({ title: "상품명을 입력해주세요.", variant: "destructive" });
      return;
    }
    if (Number(amount) <= 0) {
      toast({ title: "금액을 입력해주세요.", variant: "destructive" });
      return;
    }
    mutation.mutate();
  };

  const handleDelete = (item: RegionalManagementFee) => {
    const confirmed = window.confirm(`'${item.productName}' 관리비를 삭제할까요?`);
    if (!confirmed) return;
    deleteMutation.mutate(item.id);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Wallet className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            관리비
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
              placeholder="상품명, 금액, 등록자 검색"
              className="pl-9 w-72 rounded-none"
              data-testid="input-regional-management-fee-search"
            />
          </div>
          <Button className="gap-2 rounded-none" onClick={openCreateDialog} data-testid="button-create-regional-management-fee">
            <Plus className="w-4 h-4" />
            관리비 등록
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="rounded-none">
          <CardContent className="p-4 space-y-1">
            <div className="text-sm text-muted-foreground">관리비 총금액</div>
            <div className="text-2xl font-bold">{formatAmount(data.totalAmount)}</div>
          </CardContent>
        </Card>
        <Card className="rounded-none">
          <CardContent className="p-4 space-y-1">
            <div className="text-sm text-muted-foreground">등록 건수</div>
            <div className="text-2xl font-bold">{data.totalCount.toLocaleString()}건</div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-none">
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">일자</TableHead>
                  <TableHead className="whitespace-nowrap">상품</TableHead>
                  <TableHead className="whitespace-nowrap text-right">금액</TableHead>
                  <TableHead className="whitespace-nowrap">등록자</TableHead>
                  <TableHead className="whitespace-nowrap">최종수정</TableHead>
                  <TableHead className="whitespace-nowrap text-center">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, index) => (
                    <TableRow key={`regional-management-fee-skeleton-${index}`}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : currentRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      등록된 관리비가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  currentRows.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap">{formatDateOnly(item.feeDate)}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.productName}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium">{formatAmount(item.amount)}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.createdBy || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {item.updatedBy ? `${item.updatedBy} / ${formatDateTime(item.updatedAt)}` : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-none"
                            onClick={() => openEditDialog(item)}
                            data-testid={`button-edit-regional-management-fee-${item.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-none text-destructive hover:text-destructive"
                            onClick={() => handleDelete(item)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-regional-management-fee-${item.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">총 {filteredItems.length}건</span>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="sm:max-w-[520px] rounded-none">
          <DialogHeader>
            <DialogTitle>{editingItem ? "관리비 수정" : "관리비 등록"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">일자</label>
              <div className="relative">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={feeDate}
                  onChange={(event) => setFeeDate(event.target.value)}
                  className="pl-9 rounded-none"
                  data-testid="input-regional-management-fee-date"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">상품</label>
              <Input
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
                placeholder="상품명을 입력하세요"
                className="rounded-none"
                data-testid="input-regional-management-fee-product"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">금액</label>
              <Input
                type="number"
                min={0}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0"
                className="rounded-none"
                data-testid="input-regional-management-fee-amount"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-none" onClick={closeDialog}>
              취소
            </Button>
            <Button
              type="button"
              className="rounded-none"
              onClick={handleSubmit}
              disabled={mutation.isPending}
              data-testid="button-save-regional-management-fee"
            >
              {mutation.isPending ? "저장 중..." : editingItem ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
