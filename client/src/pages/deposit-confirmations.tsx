import { useEffect, useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomCalendar } from "@/components/custom-calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Landmark, Search, Upload, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Check, Plus, Trash2, FileText, Pencil } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import type { Deposit, Contract, RefundWithContract } from "@shared/schema";
import { getKoreanStartOfYear, getKoreanEndOfDay, isWithinKoreanDateRange } from "@/lib/korean-time";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSettings } from "@/lib/settings";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { matchesKoreanSearch } from "@shared/korean-search";
import { getFinancialAmountWithVat } from "@/lib/contract-financials";

type MatchProductItem = {
  productName?: string;
  unitPrice?: number;
  vatType?: string | null;
  addQuantity?: number;
  extendQuantity?: number;
  quantity?: number;
};

export default function DepositConfirmationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { formatDate } = useSettings();
  const hasDepositActionAccess =
    ["경영지원팀", "개발팀"].includes((user?.department || "").trim()) ||
    ["대표이사", "총괄이사", "개발자"].includes((user?.role || "").trim());
  const showDepositActionDeniedMessage = () => {
    toast({ title: "입금확인 등록, 엑셀 업로드, 수정, 삭제는 경영지원팀/개발팀 또는 대표이사/총괄이사/개발자만 가능합니다.", variant: "destructive" });
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [startDate, setStartDate] = useState<Date>(getKoreanStartOfYear());
  const [endDate, setEndDate] = useState<Date>(getKoreanEndOfDay());
  const [statusFilter, setStatusFilter] = useState("all");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [isRematchMode, setIsRematchMode] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState<Deposit | null>(null);
  const [contractSearch, setContractSearch] = useState("");
  const [contractSortMode, setContractSortMode] = useState<"amount" | "latest">("amount");
  const [selectedContractIds, setSelectedContractIds] = useState<string[]>([]);
  const [selectedRefundIds, setSelectedRefundIds] = useState<string[]>([]);
  const [dialogPage, setDialogPage] = useState(1);
  const dialogPageSize = 10;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [formDepositDate, setFormDepositDate] = useState("");
  const [formDepositorName, setFormDepositorName] = useState("");
  const [formDepositAmount, setFormDepositAmount] = useState("");
  const [formDepositBank, setFormDepositBank] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [notesViewOpen, setNotesViewOpen] = useState(false);
  const [viewingNotes, setViewingNotes] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingDeposit, setEditingDeposit] = useState<Deposit | null>(null);
  const [editDepositDate, setEditDepositDate] = useState("");
  const [editDepositorName, setEditDepositorName] = useState("");
  const [editDepositAmount, setEditDepositAmount] = useState("");
  const [editDepositBank, setEditDepositBank] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [hiddenDepositIds, setHiddenDepositIds] = useState<Set<string>>(new Set());

  const { data: depositsData = [], isLoading } = useQuery<Deposit[]>({
    queryKey: ["/api/deposits"],
  });

  const { data: contractsData = [] } = useQuery<Contract[]>({
    queryKey: ["/api/deposits/contracts-by-department"],
  });

  const { data: allContractsData = [] } = useQuery<Contract[]>({
    queryKey: ["/api/contracts"],
  });

  const { data: refundsData = [] } = useQuery<RefundWithContract[]>({
    queryKey: ["/api/refunds"],
  });

  const contractById = useMemo(
    () => new Map(allContractsData.map((contract) => [String(contract.id), contract])),
    [allContractsData],
  );

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/deposits/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        let errorMessage = "엑셀 업로드에 실패했습니다.";
        try {
          const data = await res.json();
          errorMessage = data?.error || data?.message || errorMessage;
        } catch {
          const text = await res.text();
          if (text.trim()) errorMessage = text;
        }
        throw new Error(errorMessage);
      }
      return res.json();
    },
    onSuccess: async (data) => {
      setCurrentPage(1);
      await queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
      await queryClient.refetchQueries({ queryKey: ["/api/deposits"], type: "active" });
      toast({ title: `${data.count}건이 업로드되었습니다.` });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "엑셀 업로드에 실패했습니다.", variant: "destructive" });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async ({
      depositId,
      contractIds,
      refundIds,
      confirmedAmount,
    }: {
      depositId: string;
      contractIds: string[];
      refundIds: string[];
      confirmedAmount: number;
    }) => {
      const res = await apiRequest("PUT", `/api/deposits/${depositId}`, {
        contractIds,
        refundIds,
        confirmedAmount,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deposits/contracts-by-department"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts-with-financials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/refunds"] });
      setConfirmDialogOpen(false);
      setSelectedDeposit(null);
      setSelectedContractIds([]);
      setSelectedRefundIds([]);
      setIsRematchMode(false);
      toast({ title: "입금 확인이 완료되었습니다." });
    },
    onError: () => {
      toast({ title: "확인 처리에 실패했습니다.", variant: "destructive" });
    },
  });

  const createDepositMutation = useMutation({
    mutationFn: async (data: { depositDate: string; depositorName: string; depositAmount: number; depositBank: string; notes: string }) => {
      const res = await apiRequest("POST", "/api/deposits", {
        depositDate: new Date(data.depositDate).toISOString(),
        depositorName: data.depositorName,
        depositAmount: data.depositAmount,
        depositBank: data.depositBank || null,
        notes: data.notes || null,
      });
      return res.json();
    },
    onSuccess: (created: Deposit) => {
      setHiddenDepositIds((prev) => {
        if (!prev.has(created.id)) return prev;
        const next = new Set(prev);
        next.delete(created.id);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
      setRegisterDialogOpen(false);
      resetForm();
      toast({ title: "입금 내역이 등록되었습니다." });
    },
    onError: () => {
      toast({ title: "등록에 실패했습니다.", variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/deposits/bulk-delete", { ids });
      const data = await res.json();
      return data;
    },
    onSuccess: async (data) => {
      const deletedIds = Array.isArray((data as any).deletedIds) ? ((data as any).deletedIds as string[]) : [];
      if (deletedIds.length > 0) {
        setHiddenDepositIds((prev) => {
          const next = new Set(prev);
          deletedIds.forEach((id) => next.add(id));
          return next;
        });
        queryClient.setQueryData<Deposit[]>(["/api/deposits"], (previous = []) =>
          previous.filter((deposit) => !deletedIds.includes(deposit.id)),
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/deposits/contracts-by-department"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/refunds"] });
      await queryClient.refetchQueries({ queryKey: ["/api/deposits"], type: "active" });
      setSelectedIds(new Set());
      toast({ title: `${data.deletedCount}건이 삭제되었습니다.` });
    },
    onError: () => {
      toast({ title: "삭제에 실패했습니다.", variant: "destructive" });
    },
  });

  const singleDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/deposits/${id}`);
      return { id };
    },
    onSuccess: async ({ id }) => {
      setHiddenDepositIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      queryClient.setQueryData<Deposit[]>(["/api/deposits"], (previous = []) =>
        previous.filter((deposit) => deposit.id !== id),
      );
      await queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/deposits/contracts-by-department"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/refunds"] });
      await queryClient.refetchQueries({ queryKey: ["/api/deposits"], type: "active" });
      toast({ title: "삭제되었습니다." });
    },
    onError: () => {
      toast({ title: "삭제에 실패했습니다.", variant: "destructive" });
    },
  });

  const updateDepositMutation = useMutation({
    mutationFn: async (data: { id: string; depositDate: string; depositorName: string; depositAmount: number; depositBank: string; notes: string }) => {
      const res = await apiRequest("PUT", `/api/deposits/${data.id}`, {
        depositDate: new Date(data.depositDate).toISOString(),
        depositorName: data.depositorName,
        depositAmount: data.depositAmount,
        depositBank: data.depositBank || null,
        notes: data.notes || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
      setEditDialogOpen(false);
      setEditingDeposit(null);
      toast({ title: "입금 내역을 수정했습니다." });
    },
    onError: () => {
      toast({ title: "입금 내역 수정에 실패했습니다.", variant: "destructive" });
    },
  });

  const toggleSelectId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const currentPageIds = paginatedDeposits.map(d => d.id);
    const allSelected = currentPageIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        currentPageIds.forEach(id => next.delete(id));
      } else {
        currentPageIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleBulkDelete = () => {
    if (!hasDepositActionAccess) {
      showDepositActionDeniedMessage();
      return;
    }
    if (selectedIds.size === 0) return;
    bulkDeleteMutation.mutate(Array.from(selectedIds));
  };

  const handleSingleDelete = (id: string) => {
    if (!hasDepositActionAccess) {
      showDepositActionDeniedMessage();
      return;
    }
    singleDeleteMutation.mutate(id);
  };

  const resetForm = () => {
    setFormDepositDate("");
    setFormDepositorName("");
    setFormDepositAmount("");
    setFormDepositBank("");
    setFormNotes("");
  };

  const handleOpenRegister = () => {
    if (!hasDepositActionAccess) {
      showDepositActionDeniedMessage();
      return;
    }
    resetForm();
    const today = new Date();
    setFormDepositDate(format(today, "yyyy-MM-dd"));
    setRegisterDialogOpen(true);
  };

  const handleRegisterSubmit = () => {
    if (!hasDepositActionAccess) {
      showDepositActionDeniedMessage();
      return;
    }
    if (!formDepositorName.trim() || !formDepositDate) {
      toast({ title: "입금일자와 입금자명을 입력해주세요.", variant: "destructive" });
      return;
    }
    createDepositMutation.mutate({
      depositDate: formDepositDate,
      depositorName: formDepositorName.trim(),
      depositAmount: Number(formDepositAmount.replace(/[,원]/g, "")) || 0,
      depositBank: formDepositBank.trim(),
      notes: formNotes.trim(),
    });
  };

  const baseFilteredDeposits = useMemo(() => {
    let filtered = depositsData.filter((deposit) => !hiddenDepositIds.has(deposit.id));

    if (searchQuery) {
      filtered = filtered.filter((deposit) =>
        matchesKoreanSearch([deposit.depositorName, deposit.depositBank], searchQuery),
      );
    }

    filtered = filtered.filter((d) => isWithinKoreanDateRange(d.depositDate, startDate, endDate));

    return filtered;
  }, [depositsData, hiddenDepositIds, searchQuery, startDate, endDate]);

  const filteredDeposits = useMemo(() => {
    if (statusFilter === "confirmed") {
      return baseFilteredDeposits.filter((d) => d.confirmedAt);
    }
    if (statusFilter === "pending") {
      return baseFilteredDeposits.filter((d) => !d.confirmedAt);
    }
    return baseFilteredDeposits;
  }, [baseFilteredDeposits, statusFilter]);

  const totalPages = Math.ceil(filteredDeposits.length / itemsPerPage);
  const paginatedDeposits = filteredDeposits.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchQuery, statusFilter, currentPage, itemsPerPage, startDate, endDate]);

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("ko-KR").format(amount);
  };

  const normalizeVatType = (vat: string | null | undefined) => {
    const normalized = String(vat || "").replace(/\s+/g, "");
    if (["부가세포함", "포함"].includes(normalized)) return "포함";
    return "미포함";
  };

  const parseInvoiceIssued = (value: string | null | undefined): boolean => {
    const normalized = String(value || "").replace(/\s+/g, "").toLowerCase();
    return ["true", "1", "y", "yes", "o", "발행", "발급", "포함", "부가세포함"].includes(normalized);
  };

  const getItemQuantity = (item: MatchProductItem) => {
    const addQuantity = Math.max(0, Number(item.addQuantity) || 0);
    const extendQuantity = Math.max(0, Number(item.extendQuantity) || 0);
    const quantity = Math.max(0, Number(item.quantity) || 0);
    return addQuantity + extendQuantity > 0 ? addQuantity + extendQuantity : Math.max(1, quantity || 1);
  };

  const parseStoredProductItems = (contract: Contract): MatchProductItem[] => {
    const rawJson = String(contract.productDetailsJson || "").trim();
    if (!rawJson) return [];
    try {
      const parsed = JSON.parse(rawJson);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item): item is MatchProductItem => !!item && typeof item === "object");
    } catch {
      return [];
    }
  };

  const getContractMatchAmount = (contract: Contract) => {
    const items = parseStoredProductItems(contract).filter((item) => String(item.productName || "").trim());
    if (items.length > 0) {
      return items.reduce((sum, item) => {
        const supplyAmount = Math.max(0, Number(item.unitPrice) || 0) * getItemQuantity(item);
        const vatAmount = normalizeVatType(item.vatType) === "포함" ? Math.round(supplyAmount * 0.1) : 0;
        return sum + supplyAmount + vatAmount;
      }, 0);
    }

    const baseAmount = Math.max(0, Number(contract.cost) || 0);
    if (parseInvoiceIssued(contract.invoiceIssued)) {
      return baseAmount + Math.round(baseAmount * 0.1);
    }
    return baseAmount;
  };

  const getResolvedDepositContractAmount = (deposit: Deposit, matchedContract?: Contract | null) => {
    const storedAmount = Math.max(Number(deposit.totalContractAmount) || 0, 0);
    if (storedAmount > 0) return storedAmount;
    if (!matchedContract) return storedAmount;
    const computedAmount = Math.max(getContractMatchAmount(matchedContract), 0);
    return computedAmount;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!hasDepositActionAccess) {
      showDepositActionDeniedMessage();
      e.target.value = "";
      return;
    }
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
      e.target.value = "";
    }
  };

  const handleConfirmClick = (deposit: Deposit) => {
    setIsRematchMode(false);
    setSelectedDeposit(deposit);
    setContractSearch("");
    setContractSortMode("amount");
    setSelectedContractIds([]);
    setSelectedRefundIds([]);
    setDialogPage(1);
    setConfirmDialogOpen(true);
  };

  const toDateInputValue = (rawDate: Date | string | null | undefined) => {
    if (!rawDate) return format(new Date(), "yyyy-MM-dd");
    const parsed = new Date(rawDate);
    if (isNaN(parsed.getTime())) return format(new Date(), "yyyy-MM-dd");
    return format(parsed, "yyyy-MM-dd");
  };

  const openEditDialog = (deposit: Deposit) => {
    if (!hasDepositActionAccess) {
      showDepositActionDeniedMessage();
      return;
    }
    setEditingDeposit(deposit);
    setEditDepositDate(toDateInputValue(deposit.depositDate));
    setEditDepositorName(String(deposit.depositorName || ""));
    setEditDepositAmount(String(deposit.depositAmount ?? 0));
    setEditDepositBank(String(deposit.depositBank || ""));
    setEditNotes(String(deposit.notes || ""));
    setEditDialogOpen(true);
  };

  const handleEditSubmit = () => {
    if (!hasDepositActionAccess) {
      showDepositActionDeniedMessage();
      return;
    }
    if (!editingDeposit) return;
    if (!editDepositorName.trim() || !editDepositDate) {
      toast({ title: "입금일자와 입금자명을 입력해주세요.", variant: "destructive" });
      return;
    }
    updateDepositMutation.mutate({
      id: editingDeposit.id,
      depositDate: editDepositDate,
      depositorName: editDepositorName.trim(),
      depositAmount: Number(editDepositAmount.replace(/[,\s]/g, "")) || 0,
      depositBank: editDepositBank.trim(),
      notes: editNotes.trim(),
    });
  };

  const handleRematchClick = (deposit: Deposit) => {
    setIsRematchMode(true);
    setSelectedDeposit(deposit);
    setContractSearch("");
    setContractSortMode("amount");
    setSelectedContractIds(deposit.contractId ? [deposit.contractId] : []);
    setSelectedRefundIds([]);
    setDialogPage(1);
    setConfirmDialogOpen(true);
  };

  const toggleContractSelection = (contractId: string) => {
    setSelectedContractIds((prev) => {
      return prev.includes(contractId)
        ? prev.filter((id) => id !== contractId)
        : [...prev, contractId];
    });
  };

  const toggleRefundSelection = (refundId: string) => {
    setSelectedRefundIds((prev) =>
      prev.includes(refundId) ? prev.filter((id) => id !== refundId) : [...prev, refundId],
    );
  };

  const selectedContractsTotalCost = useMemo(() => {
    return allContractsData
      .filter(c => selectedContractIds.includes(c.id))
      .reduce((sum, c) => sum + getContractMatchAmount(c), 0);
  }, [allContractsData, selectedContractIds]);

  const filteredPendingRefunds = useMemo(() => {
    let filtered = refundsData.filter((refund) => refund.refundStatus === "환불대기");

    if (contractSearch) {
      filtered = filtered.filter((refund) =>
        matchesKoreanSearch(
          [refund.customerName, refund.userIdentifier, refund.products, refund.managerName, refund.worker, refund.reason],
          contractSearch,
        ),
      );
    }

    return filtered.sort((a, b) => {
      const aTime = new Date(a.refundDate || a.createdAt || 0).getTime();
      const bTime = new Date(b.refundDate || b.createdAt || 0).getTime();
      if (aTime !== bTime) return bTime - aTime;
      return String(a.customerName || "").localeCompare(String(b.customerName || ""), "ko");
    });
  }, [refundsData, contractSearch]);

  const getRefundGrossAmount = (refund: RefundWithContract) =>
    getFinancialAmountWithVat(contractById.get(String(refund.contractId || "")), refund);

  const selectedRefundOffsetAmount = useMemo(() => {
    return refundsData
      .filter((refund) => selectedRefundIds.includes(refund.id))
      .reduce((sum, refund) => sum + getRefundGrossAmount(refund), 0);
  }, [refundsData, selectedRefundIds, contractById]);

  const selectedDepositAmount = Number(selectedDeposit?.depositAmount) || 0;
  const selectedMatchedAmount = Math.max(selectedContractsTotalCost - selectedRefundOffsetAmount, 0);
  const selectedShortfallAmount = Math.max(selectedMatchedAmount - selectedDepositAmount, 0);
  const selectedExcessAmount = Math.max(selectedDepositAmount - selectedMatchedAmount, 0);

  const handleConfirmSelected = () => {
    if (!selectedDeposit || (selectedContractIds.length === 0 && selectedRefundIds.length === 0)) return;
    const contractIdsForSubmit = selectedContractIds;
    confirmMutation.mutate({
      depositId: selectedDeposit.id,
      contractIds: contractIdsForSubmit,
      refundIds: selectedRefundIds,
      confirmedAmount: selectedDeposit.depositAmount,
    });
  };

  const filteredContracts = useMemo(() => {
    let filtered = [...contractsData];

    if (selectedDeposit?.contractId) {
      const mappedContract = allContractsData.find((contract) => contract.id === selectedDeposit.contractId);
      if (mappedContract && !filtered.some((contract) => contract.id === mappedContract.id)) {
        filtered = [mappedContract, ...filtered];
      }
    }

    if (contractSearch) {
      filtered = filtered.filter((contract) =>
        matchesKoreanSearch(
          [contract.customerName, contract.contractNumber, contract.managerName, contract.cost],
          contractSearch,
        ),
      );
    }
    if (contractSortMode === "latest") {
      filtered = [...filtered].sort((a, b) => {
        const aTime = new Date(a.contractDate).getTime();
        const bTime = new Date(b.contractDate).getTime();
        if (aTime !== bTime) return bTime - aTime;
        return String(a.contractNumber || "").localeCompare(String(b.contractNumber || ""), "ko");
      });
    } else if (selectedDeposit) {
      const depositAmount = Number(selectedDeposit.depositAmount) || 0;
      filtered = [...filtered].sort((a, b) => {
        const aDiff = Math.abs(getContractMatchAmount(a) - depositAmount);
        const bDiff = Math.abs(getContractMatchAmount(b) - depositAmount);
        if (aDiff !== bDiff) return aDiff - bDiff;

        const aTime = new Date(a.contractDate).getTime();
        const bTime = new Date(b.contractDate).getTime();
        if (aTime !== bTime) return bTime - aTime;

        return String(a.contractNumber || "").localeCompare(String(b.contractNumber || ""), "ko");
      });
    } else {
      filtered = [...filtered].sort((a, b) => new Date(b.contractDate).getTime() - new Date(a.contractDate).getTime());
    }
    return filtered;
  }, [contractsData, allContractsData, contractSearch, selectedDeposit, contractSortMode]);

  const dialogTotalPages = Math.ceil(filteredContracts.length / dialogPageSize);
  const paginatedContracts = filteredContracts.slice(
    (dialogPage - 1) * dialogPageSize,
    dialogPage * dialogPageSize
  );

  const currentMonthAmount = depositsData
    .filter((deposit) => !hiddenDepositIds.has(deposit.id))
    .filter((deposit) => format(new Date(deposit.depositDate), "yyyy-MM") === format(new Date(), "yyyy-MM"))
    .reduce((sum, d) => sum + d.depositAmount, 0);
  const confirmedCount = baseFilteredDeposits.filter(d => d.confirmedAt).length;
  const pendingCount = baseFilteredDeposits.filter(d => !d.confirmedAt).length;
  const applyStatusFilter = (status: "all" | "confirmed" | "pending") => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Landmark className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">입금확인 목록</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground">
            전체 {baseFilteredDeposits.length}건 | 확인 {confirmedCount}건 |{" "}
            <button
              type="button"
              className="font-medium text-orange-600 hover:underline"
              onClick={() => applyStatusFilter("pending")}
              data-testid="button-summary-pending-filter"
            >
              미확인 {pendingCount}건
            </button>
          </span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="입금자명 검색"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="pl-9 w-64 rounded-none"
              data-testid="input-search"
            />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileUpload}
            data-testid="input-file-upload"
          />
          <Button
            variant="outline"
            className="gap-2 rounded-none"
            onClick={() => fileInputRef.current?.click()}
            disabled={!hasDepositActionAccess || uploadMutation.isPending}
            data-testid="button-excel-upload"
            title="입금확인 업로드 v20260403"
          >
            <Upload className="w-4 h-4" />
            {uploadMutation.isPending ? "업로드 중..." : "엑셀 업로드"}
          </Button>
          <Button
            className="gap-2 rounded-none"
            onClick={handleOpenRegister}
            disabled={!hasDepositActionAccess}
            data-testid="button-register-deposit"
          >
            <Plus className="w-4 h-4" />
            등록
          </Button>
          <Button
            variant="destructive"
            className="gap-2 rounded-none"
            onClick={handleBulkDelete}
            disabled={!hasDepositActionAccess || selectedIds.size === 0 || bulkDeleteMutation.isPending}
            data-testid="button-bulk-delete"
          >
            <Trash2 className="w-4 h-4" />
            {"\uC120\uD0DD \uC0AD\uC81C"} ({selectedIds.size})
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card
          className={`rounded-none cursor-pointer transition-colors hover:bg-muted/40 ${statusFilter === "all" ? "ring-1 ring-primary/40" : ""}`}
          onClick={() => applyStatusFilter("all")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              applyStatusFilter("all");
            }
          }}
          role="button"
          tabIndex={0}
          data-testid="card-total-filter"
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">당월 총입금액</p>
                <p className="text-xl font-bold mt-1" data-testid="text-total-amount">{formatAmount(currentMonthAmount)}원</p>
              </div>
              <Landmark className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card
          className={`rounded-none cursor-pointer transition-colors hover:bg-muted/40 ${statusFilter === "confirmed" ? "ring-1 ring-green-500/50" : ""}`}
          onClick={() => applyStatusFilter("confirmed")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              applyStatusFilter("confirmed");
            }
          }}
          role="button"
          tabIndex={0}
          data-testid="card-confirmed-filter"
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">확인 완료</p>
                <p className="text-xl font-bold mt-1 text-green-500" data-testid="text-confirmed-count">{confirmedCount}건</p>
              </div>
              <Check className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card
          className={`rounded-none cursor-pointer transition-colors hover:bg-muted/40 ${statusFilter === "pending" ? "ring-1 ring-orange-400" : ""}`}
          onClick={() => applyStatusFilter("pending")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              applyStatusFilter("pending");
            }
          }}
          role="button"
          tabIndex={0}
          data-testid="card-pending-filter"
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">미확인</p>
                <p className="text-xl font-bold mt-1 text-orange-500" data-testid="text-pending-count">{pendingCount}건</p>
              </div>
              <CalendarIcon className="w-8 h-8 text-orange-500 opacity-50" />
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
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-32 rounded-none" data-testid="filter-status">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="confirmed">확인완료</SelectItem>
            <SelectItem value="pending">미확인</SelectItem>
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
            setStatusFilter("all");
            setCurrentPage(1);
          }}
          data-testid="button-reset-filters"
        >
          초기화
        </Button>
      </div>

      <Card className="rounded-none">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-10 text-center">
                    <Checkbox
                      checked={paginatedDeposits.length > 0 && paginatedDeposits.every(d => selectedIds.has(d.id))}
                      onCheckedChange={toggleSelectAll}
                      disabled={!hasDepositActionAccess}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead className="text-xs font-medium text-center whitespace-nowrap">입금일자</TableHead>
                  <TableHead className="text-xs font-medium text-center whitespace-nowrap">입금은행</TableHead>
                  <TableHead className="text-xs font-medium text-center whitespace-nowrap">입금금액</TableHead>
                  <TableHead className="text-xs font-medium text-center whitespace-nowrap">입금자명</TableHead>
                  <TableHead className="text-xs font-medium text-center whitespace-nowrap">입금상태</TableHead>
                  <TableHead className="text-xs font-medium text-center whitespace-nowrap">매칭</TableHead>
                  <TableHead className="text-xs font-medium text-center whitespace-nowrap">매칭고객명</TableHead>
                  <TableHead className="text-xs font-medium text-center whitespace-nowrap">비고</TableHead>
                  <TableHead className="text-xs font-medium text-center whitespace-nowrap">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : paginatedDeposits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="p-12 text-center text-muted-foreground">
                      등록된 입금 내역이 없습니다. 엑셀 파일을 업로드하세요.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedDeposits.map((deposit) => {
                    const isConfirmed = !!deposit.confirmedAt;
                    const matchedContract = allContractsData.find(c => c.id === deposit.contractId);
                    const totalContract = getResolvedDepositContractAmount(deposit, matchedContract);
                    const depositAmount = Number(deposit.depositAmount) || 0;
                    const shortfallAmount = Math.max(totalContract - depositAmount, 0);
                    const excessAmount = Math.max(depositAmount - totalContract, 0);
                    return (
                      <TableRow key={deposit.id} className={`hover:bg-muted/20 ${selectedIds.has(deposit.id) ? "bg-primary/5" : ""}`} data-testid={`row-deposit-${deposit.id}`}>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={selectedIds.has(deposit.id)}
                            onCheckedChange={() => toggleSelectId(deposit.id)}
                            disabled={!hasDepositActionAccess}
                            data-testid={`checkbox-deposit-${deposit.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap text-center">{formatDate(deposit.depositDate)}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap font-medium text-center">{deposit.depositBank || "-"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap font-medium text-center">{formatAmount(deposit.depositAmount)}원</TableCell>
                        <TableCell className="text-xs whitespace-nowrap font-medium text-center">{deposit.depositorName}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap font-medium text-center">
                          {isConfirmed ? (
                            shortfallAmount > 0 ? (
                              <span className="text-blue-600 font-medium">입금부족 {formatAmount(shortfallAmount)}원</span>
                            ) : excessAmount > 0 ? (
                              <span className="text-red-600 font-medium">초과입금 {formatAmount(excessAmount)}원</span>
                            ) : (
                              <span className="text-green-600">정상</span>
                            )
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap text-center">
                          {isConfirmed ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 text-xs underline underline-offset-2"
                              onClick={() => handleRematchClick(deposit)}
                              data-testid={`button-contract-number-${deposit.id}`}
                            >
                              재매칭
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-none text-xs"
                              onClick={() => handleConfirmClick(deposit)}
                              data-testid={`button-confirm-${deposit.id}`}
                            >
                              매칭
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap text-center">
                          {isConfirmed && matchedContract ? matchedContract.customerName : "-"}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap text-center">
                          {deposit.notes ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => { setViewingNotes(deposit.notes || ""); setNotesViewOpen(true); }}
                              data-testid={`button-notes-${deposit.id}`}
                            >
                              <FileText className="w-3 h-3" />
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-none text-xs gap-1"
                              onClick={() => openEditDialog(deposit)}
                              disabled={!hasDepositActionAccess}
                              data-testid={`button-edit-${deposit.id}`}
                            >
                              <Pencil className="w-3 h-3" />
                              수정
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="rounded-none text-xs gap-1"
                              onClick={() => handleSingleDelete(deposit.id)}
                              disabled={!hasDepositActionAccess}
                              data-testid={`button-delete-${deposit.id}`}
                            >
                              <Trash2 className="w-3 h-3" />
                              삭제
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
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

      <Dialog open={confirmDialogOpen} onOpenChange={(open) => {
        setConfirmDialogOpen(open);
        if (!open) {
          setSelectedContractIds([]);
          setSelectedRefundIds([]);
          setSelectedDeposit(null);
          setIsRematchMode(false);
        }
      }}>
        <DialogContent className="flex h-[90vh] w-[96vw] max-w-[1280px] flex-col gap-0 overflow-hidden rounded-none p-0">
          <DialogHeader className="border-b border-border px-6 py-4 pr-12">
            <DialogTitle>{isRematchMode ? "\uB9E4\uCE6D \uC218\uC815" : "\uACC4\uC57D \uB9E4\uCE6D - \uC785\uAE08 \uD655\uC778"}</DialogTitle>
          </DialogHeader>
          {selectedDeposit && (
            <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-none border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">입금자명</p>
                  <p className="mt-1 break-all text-sm font-semibold">{selectedDeposit.depositorName}</p>
                </div>
                <div className="rounded-none border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">입금금액</p>
                  <p className="mt-1 text-sm font-semibold">{formatAmount(selectedDeposit.depositAmount)}원</p>
                </div>
                <div className="rounded-none border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">입금일자</p>
                  <p className="mt-1 text-sm font-semibold">{formatDate(selectedDeposit.depositDate)}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="고객명, 담당자, 계약금액 검색"
                    value={contractSearch}
                    onChange={(e) => { setContractSearch(e.target.value); setDialogPage(1); }}
                    className="pl-9 rounded-none"
                    data-testid="input-contract-search"
                  />
                </div>

                <Button
                  type="button"
                  variant={contractSortMode === "latest" ? "default" : "outline"}
                  className="rounded-none whitespace-nowrap"
                  onClick={() => {
                    setContractSortMode((prev) => (prev === "latest" ? "amount" : "latest"));
                    setDialogPage(1);
                  }}
                  data-testid="button-contract-sort-latest"
                >
                  {contractSortMode === "latest" ? "유사금액순" : "계약일 최신순"}
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden rounded-none border border-border bg-background">
                <div className="h-full overflow-auto">
                  <Table className="min-w-[920px]">
                    <TableHeader className="sticky top-0 z-10 bg-white">
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs font-medium w-10 text-center whitespace-nowrap">
                          <Checkbox
                            checked={paginatedContracts.length > 0 && paginatedContracts.every(c => selectedContractIds.includes(c.id))}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                const newIds = Array.from(new Set([...selectedContractIds, ...paginatedContracts.map(c => c.id)]));
                                setSelectedContractIds(newIds);
                              } else {
                                const pageIds = paginatedContracts.map(c => c.id);
                                setSelectedContractIds(prev => prev.filter(id => !pageIds.includes(id)));
                              }
                            }}
                            data-testid="checkbox-select-all"
                          />
                        </TableHead>
                        <TableHead className="w-[110px] text-xs font-medium whitespace-nowrap">계약일</TableHead>
                        <TableHead className="min-w-[180px] text-xs font-medium whitespace-nowrap">고객명</TableHead>
                        <TableHead className="w-[110px] text-xs font-medium whitespace-nowrap">담당자</TableHead>
                        <TableHead className="w-[130px] text-xs font-medium text-right whitespace-nowrap">계약금액</TableHead>
                        <TableHead className="w-[130px] text-xs font-medium text-right whitespace-nowrap">입금부족</TableHead>
                        <TableHead className="w-[130px] text-xs font-medium text-right whitespace-nowrap">초과입금</TableHead>
                        <TableHead className="min-w-[220px] text-xs font-medium whitespace-nowrap">상품</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedContracts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="p-8 text-center text-muted-foreground">
                            검색 결과가 없습니다.
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedContracts.map((contract) => {
                          const contractAmount = getContractMatchAmount(contract);
                          const isAmountMatch = selectedDeposit && contractAmount === selectedDeposit.depositAmount;
                          const isSelected = selectedContractIds.includes(contract.id);
                          const depositAmt = selectedDeposit?.depositAmount || 0;
                          const contractShortfallAmount = Math.max(contractAmount - depositAmt, 0);
                          const contractExcessAmount = Math.max(depositAmt - contractAmount, 0);
                          return (
                            <TableRow
                              key={contract.id}
                              className={`hover:bg-muted/20 cursor-pointer ${isAmountMatch ? "bg-primary/5" : ""} ${isSelected ? "bg-primary/10" : ""}`}
                              onClick={() => toggleContractSelection(contract.id)}
                              data-testid={`row-contract-match-${contract.id}`}
                            >
                              <TableCell className="text-xs whitespace-nowrap text-center">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleContractSelection(contract.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  data-testid={`checkbox-contract-${contract.id}`}
                                />
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{formatDate(contract.contractDate)}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap font-medium">
                                <div className="flex items-center gap-2">
                                  {contract.customerName}
                                  {isAmountMatch && <Badge variant="default" className="rounded-none text-[10px] px-1.5 py-0">금액일치</Badge>}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{contract.managerName}</TableCell>
                              <TableCell className={`text-xs whitespace-nowrap font-medium text-right ${isAmountMatch ? "text-primary" : ""}`}>{formatAmount(contractAmount)}원</TableCell>
                              <TableCell className="text-xs whitespace-nowrap font-medium text-right">
                                {contractShortfallAmount > 0 ? (
                                  <span className="text-blue-600">{formatAmount(contractShortfallAmount)}원</span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap font-medium text-right">
                                {contractExcessAmount > 0 ? (
                                  <span className="text-red-600">{formatAmount(contractExcessAmount)}원</span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="max-w-[280px] text-xs text-muted-foreground">
                                <div className="truncate" title={contract.products || "-"}>
                                  {contract.products || "-"}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {filteredContracts.length > 0 && (
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>계약 후보 {filteredContracts.length}건 (선택 {selectedContractIds.length}건)</span>
                  {dialogTotalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-none"
                        disabled={dialogPage <= 1}
                        onClick={() => setDialogPage(p => p - 1)}
                        data-testid="button-dialog-prev"
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </Button>
                      <span className="px-2">{dialogPage} / {dialogTotalPages}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-none"
                        disabled={dialogPage >= dialogTotalPages}
                        onClick={() => setDialogPage(p => p + 1)}
                        data-testid="button-dialog-next"
                      >
                        <ChevronRight className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {filteredPendingRefunds.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">환불대기 상계 후보</span>
                    <span className="text-xs text-muted-foreground">선택 {selectedRefundIds.length}건</span>
                  </div>
                  <div className="max-h-[240px] overflow-auto rounded-none border border-border bg-background">
                    <Table className="min-w-[860px]">
                      <TableHeader className="sticky top-0 z-10 bg-white">
                        <TableRow className="bg-muted/30">
                          <TableHead className="w-10 text-center whitespace-nowrap">선택</TableHead>
                          <TableHead className="w-[110px] text-xs font-medium whitespace-nowrap">환불일</TableHead>
                          <TableHead className="min-w-[180px] text-xs font-medium whitespace-nowrap">고객명</TableHead>
                          <TableHead className="w-[110px] text-xs font-medium whitespace-nowrap">담당자</TableHead>
                          <TableHead className="w-[130px] text-xs font-medium text-right whitespace-nowrap">환불금액</TableHead>
                          <TableHead className="min-w-[220px] text-xs font-medium whitespace-nowrap">상품</TableHead>
                          <TableHead className="w-[110px] text-xs font-medium text-center whitespace-nowrap">상태</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPendingRefunds.map((refund) => {
                          const isSelected = selectedRefundIds.includes(refund.id);
                          return (
                            <TableRow
                              key={refund.id}
                              className={`hover:bg-muted/20 cursor-pointer ${isSelected ? "bg-primary/10" : ""}`}
                              onClick={() => toggleRefundSelection(refund.id)}
                              data-testid={`row-refund-match-${refund.id}`}
                            >
                              <TableCell className="text-center">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleRefundSelection(refund.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  data-testid={`checkbox-refund-${refund.id}`}
                                />
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{formatDate(refund.refundDate)}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap font-medium">{refund.customerName}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{refund.managerName || "-"}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap text-right font-medium text-red-600">
                                -{formatAmount(getRefundGrossAmount(refund))}원
                              </TableCell>
                              <TableCell className="max-w-[280px] text-xs text-muted-foreground">
                                <div className="truncate" title={refund.products || "-"}>
                                  {refund.products || "-"}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap text-center">{refund.refundStatus || "-"}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {selectedDeposit && (selectedContractIds.length > 0 || selectedRefundIds.length > 0) && (
                <div className="p-3 bg-muted/30 border border-border rounded-none space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">선택한 계약</span>
                    <span className="text-sm font-bold">{selectedContractIds.length}건</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">선택한 환불대기</span>
                    <span className="text-sm font-bold">{selectedRefundIds.length}건</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">계약 총액</span>
                    <span className="text-sm font-bold">{formatAmount(selectedContractsTotalCost)}원</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">상계 환불</span>
                    <span className="text-sm font-bold text-red-600">-{formatAmount(selectedRefundOffsetAmount)}원</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">실매칭 금액</span>
                    <span className="text-sm font-bold">{formatAmount(selectedMatchedAmount)}원</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">입금액</span>
                    <span className="text-sm font-bold">{formatAmount(selectedDeposit.depositAmount)}원</span>
                  </div>
                  {selectedShortfallAmount > 0 ? (
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
                      <span className="text-sm text-blue-600 font-medium">입금부족</span>
                      <span className="text-sm font-bold text-blue-600">
                        {formatAmount(selectedShortfallAmount)}원
                      </span>
                    </div>
                  ) : selectedExcessAmount > 0 ? (
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
                      <span className="text-sm text-red-600 font-medium">초과입금</span>
                      <span className="text-sm font-bold text-red-600">
                        {formatAmount(selectedExcessAmount)}원
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
                      <span className="text-sm text-muted-foreground">입금차이</span>
                      <span className="text-sm font-bold text-muted-foreground">0원</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter className="border-t border-border px-6 py-4">
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setConfirmDialogOpen(false)}
              data-testid="button-cancel-confirm"
            >
              취소
            </Button>
            <Button
              className="rounded-none"
              disabled={(selectedContractIds.length === 0 && selectedRefundIds.length === 0) || confirmMutation.isPending}
              onClick={handleConfirmSelected}
              data-testid="button-submit-confirm"
            >
              {confirmMutation.isPending ? "\uCC98\uB9AC \uC911..." : isRematchMode ? "\uB9E4\uCE6D\uC218\uC815 \uC800\uC7A5" : "\uD655\uC778"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={registerDialogOpen} onOpenChange={(open) => {
        setRegisterDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader>
            <DialogTitle>입금 등록</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reg-deposit-date">입금일자</Label>
              <Input
                id="reg-deposit-date"
                type="date"
                value={formDepositDate}
                onChange={(e) => setFormDepositDate(e.target.value)}
                className="rounded-none"
                data-testid="input-reg-deposit-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-deposit-bank">입금은행</Label>
              <Input
                id="reg-deposit-bank"
                type="text"
                placeholder="입금은행을 입력하세요"
                value={formDepositBank}
                onChange={(e) => setFormDepositBank(e.target.value)}
                onInput={(e) => setFormDepositBank((e.target as HTMLInputElement).value)}
                autoComplete="off"
                inputMode="text"
                spellCheck={false}
                className="rounded-none"
                data-testid="input-reg-deposit-bank"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-deposit-amount">입금금액</Label>
              <Input
                id="reg-deposit-amount"
                type="number"
                placeholder="금액을 입력하세요"
                value={formDepositAmount}
                onChange={(e) => setFormDepositAmount(e.target.value)}
                className="rounded-none"
                data-testid="input-reg-deposit-amount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-depositor-name">입금자명</Label>
              <Input
                id="reg-depositor-name"
                placeholder="입금자명을 입력하세요"
                value={formDepositorName}
                onChange={(e) => setFormDepositorName(e.target.value)}
                className="rounded-none"
                data-testid="input-reg-depositor-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-notes">비고</Label>
              <Textarea
                id="reg-notes"
                placeholder="비고를 입력하세요"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                className="rounded-none resize-none"
                rows={3}
                data-testid="input-reg-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setRegisterDialogOpen(false)}
              data-testid="button-cancel-register"
            >
              취소
            </Button>
            <Button
              className="rounded-none"
              disabled={!hasDepositActionAccess || createDepositMutation.isPending}
              onClick={handleRegisterSubmit}
              data-testid="button-submit-register"
            >
              {createDepositMutation.isPending ? "등록 중..." : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={notesViewOpen} onOpenChange={setNotesViewOpen}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader>
            <DialogTitle>비고</DialogTitle>
          </DialogHeader>
          <div className="text-sm whitespace-pre-wrap p-3 bg-muted/30 min-h-[60px]" data-testid="text-notes-content">
            {viewingNotes || "-"}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setNotesViewOpen(false)}
              data-testid="button-close-notes"
            >
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open);
        if (!open) {
          setEditingDeposit(null);
        }
      }}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader>
            <DialogTitle>입금 내역 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-deposit-date">입금일자</Label>
              <Input
                id="edit-deposit-date"
                type="date"
                value={editDepositDate}
                onChange={(e) => setEditDepositDate(e.target.value)}
                className="rounded-none"
                data-testid="input-edit-deposit-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-deposit-bank">입금은행</Label>
              <Input
                id="edit-deposit-bank"
                type="text"
                value={editDepositBank}
                onChange={(e) => setEditDepositBank(e.target.value)}
                onInput={(e) => setEditDepositBank((e.target as HTMLInputElement).value)}
                autoComplete="off"
                inputMode="text"
                spellCheck={false}
                className="rounded-none"
                data-testid="input-edit-deposit-bank"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-deposit-amount">입금금액</Label>
              <Input
                id="edit-deposit-amount"
                type="number"
                value={editDepositAmount}
                onChange={(e) => setEditDepositAmount(e.target.value)}
                className="rounded-none"
                data-testid="input-edit-deposit-amount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-depositor-name">입금자명</Label>
              <Input
                id="edit-depositor-name"
                value={editDepositorName}
                onChange={(e) => setEditDepositorName(e.target.value)}
                className="rounded-none"
                data-testid="input-edit-depositor-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">비고</Label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="rounded-none resize-none"
                rows={3}
                data-testid="input-edit-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setEditDialogOpen(false)}
              data-testid="button-cancel-edit"
            >
              취소
            </Button>
            <Button
              className="rounded-none"
              disabled={!hasDepositActionAccess || updateDepositMutation.isPending}
              onClick={handleEditSubmit}
              data-testid="button-submit-edit"
            >
              {updateDepositMutation.isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
