import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { List, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { RegionalCustomerList } from "@shared/schema";
import {
  buildRegionalCustomerListDetailState,
  createRegionalCustomerListDetailColumnKey,
  getDefaultRegionalCustomerListColumnConfig,
  getRegionalCustomerListDetailColumns,
  normalizeRegionalCustomerListColumnConfig,
  REGIONAL_CUSTOMER_LIST_TIERS,
  type RegionalCustomerListColumnConfig,
  type RegionalCustomerListDetailCategory,
  type RegionalCustomerListDetailState,
  type RegionalCustomerListTier,
} from "@shared/regional-customer-list";

type RegionalCustomerListItem = RegionalCustomerList & {
  detailColumns?: RegionalCustomerListDetailState;
};

type RegionalCustomerListResponse = {
  items: RegionalCustomerListItem[];
  totalCount: number;
};

type RegionalCustomerListColumnConfigResponse = {
  columnConfig: RegionalCustomerListColumnConfig;
};

const EMPTY_DATA: RegionalCustomerListResponse = {
  items: [],
  totalCount: 0,
};

const TABS = REGIONAL_CUSTOMER_LIST_TIERS;
const ITEMS_PER_PAGE = 20;
const ADMIN_ROLES = ["대표이사", "총괄이사", "개발자"];
const COLUMN_CATEGORY_OPTIONS: Array<{
  value: RegionalCustomerListDetailCategory;
  label: string;
  helper: string;
}> = [
  { value: "custom", label: "일반 체크", helper: "집계용이 아닌 일반 체크 컬럼" },
  { value: "exposure", label: "노출 안내", helper: "exposureNotice 집계에 포함" },
  { value: "blog", label: "블로그 리뷰", helper: "blogReview 집계에 포함" },
];

function parseCount(value: string) {
  return Math.max(Number.parseInt(String(value || "0").replace(/,/g, ""), 10) || 0, 0);
}

function formatTimelineTimestamp() {
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

function buildTimelineText(existingTimeline: string | null | undefined, newTimelineNote: string, isEditing: boolean) {
  const existing = String(existingTimeline || "").trim();
  const incoming = String(newTimelineNote || "").trim();

  if (!isEditing) {
    return incoming || null;
  }

  if (!incoming) {
    return existing || null;
  }

  const nextEntry = `[${formatTimelineTimestamp()}] ${incoming}`;
  return [existing, nextEntry].filter(Boolean).join("\n");
}

function getTierDetailColumns(
  tier: string,
  columnConfig: RegionalCustomerListColumnConfig,
) {
  return getRegionalCustomerListDetailColumns(tier, columnConfig);
}

function getItemDetailColumns(
  item: RegionalCustomerListItem,
  columnConfig: RegionalCustomerListColumnConfig,
) {
  return buildRegionalCustomerListDetailState(item.tier, {
    source: item.detailColumns,
    exposureNotice: item.exposureNotice,
    blogReview: item.blogReview,
    columnConfig,
  });
}

function getCategoryLabel(category: RegionalCustomerListDetailCategory) {
  return COLUMN_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? "일반 체크";
}

export default function RegionalCustomerListPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<RegionalCustomerListTier>("1000");
  const [currentPage, setCurrentPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RegionalCustomerListItem | null>(null);
  const [tier, setTier] = useState<RegionalCustomerListTier>("1000");
  const [customerName, setCustomerName] = useState("");
  const [registrationCount, setRegistrationCount] = useState("0");
  const [sameCustomer, setSameCustomer] = useState("");
  const [detailColumns, setDetailColumns] = useState<RegionalCustomerListDetailState>(
    () => buildRegionalCustomerListDetailState("1000"),
  );
  const [timelineNote, setTimelineNote] = useState("");
  const [draftColumnConfig, setDraftColumnConfig] = useState<RegionalCustomerListColumnConfig>(
    () => getDefaultRegionalCustomerListColumnConfig(),
  );
  const [newColumnLabel, setNewColumnLabel] = useState("");
  const [newColumnCategory, setNewColumnCategory] = useState<RegionalCustomerListDetailCategory>("custom");

  const { data = EMPTY_DATA, isLoading } = useQuery<RegionalCustomerListResponse>({
    queryKey: ["/api/regional-customer-list"],
  });

  const { data: columnConfigResponse } = useQuery<RegionalCustomerListColumnConfigResponse>({
    queryKey: ["/api/regional-customer-list/config"],
  });

  const resolvedColumnConfig = useMemo(
    () => normalizeRegionalCustomerListColumnConfig(columnConfigResponse?.columnConfig),
    [columnConfigResponse?.columnConfig],
  );

  const canManage =
    String(user?.department || "").trim() === "타지역팀" ||
    ADMIN_ROLES.includes(String(user?.role || "").trim());

  const countsByTier = useMemo(() => {
    return data.items.reduce<Record<string, number>>((acc, item) => {
      acc[item.tier] = (acc[item.tier] || 0) + 1;
      return acc;
    }, {});
  }, [data.items]);

  const filteredItems = useMemo(
    () => data.items.filter((item) => item.tier === activeTab),
    [activeTab, data.items],
  );

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const currentRows = filteredItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const activeColumns = useMemo(
    () => getTierDetailColumns(activeTab, resolvedColumnConfig),
    [activeTab, resolvedColumnConfig],
  );
  const formColumns = useMemo(
    () => getTierDetailColumns(tier, resolvedColumnConfig),
    [resolvedColumnConfig, tier],
  );
  const activeDraftColumns = useMemo(
    () => getTierDetailColumns(activeTab, draftColumnConfig),
    [activeTab, draftColumnConfig],
  );
  const tableMinWidth = 920 + activeColumns.length * 148;
  const tableColSpan = 5 + activeColumns.length;
  const tableColumnWidths = useMemo(
    () => [
      220,
      110,
      220,
      ...activeColumns.map(() => 148),
      320,
      116,
    ],
    [activeColumns],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  const showManageDenied = () => {
    toast({
      title: "고객리스트 등록, 수정, 삭제, 컬럼 관리는 타지역팀 또는 대표이사/총괄이사/개발자만 가능합니다.",
      variant: "destructive",
    });
  };

  const resetForm = (nextTier: RegionalCustomerListTier = activeTab) => {
    setEditingItem(null);
    setTier(nextTier);
    setCustomerName("");
    setRegistrationCount("0");
    setSameCustomer("");
    setDetailColumns(
      buildRegionalCustomerListDetailState(nextTier, {
        columnConfig: resolvedColumnConfig,
      }),
    );
    setTimelineNote("");
  };

  const openCreateDialog = () => {
    if (!canManage) {
      showManageDenied();
      return;
    }
    resetForm(activeTab);
    setDialogOpen(true);
  };

  const openEditDialog = (item: RegionalCustomerListItem) => {
    if (!canManage) {
      showManageDenied();
      return;
    }

    const nextTier = TABS.includes(item.tier as RegionalCustomerListTier)
      ? (item.tier as RegionalCustomerListTier)
      : activeTab;

    setEditingItem(item);
    setTier(nextTier);
    setCustomerName(item.customerName || "");
    setRegistrationCount(String(item.registrationCount || 0));
    setSameCustomer(item.sameCustomer || "");
    setDetailColumns(getItemDetailColumns(item, resolvedColumnConfig));
    setTimelineNote("");
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  const handleTierChange = (nextTier: RegionalCustomerListTier) => {
    setTier(nextTier);
    setDetailColumns(
      buildRegionalCustomerListDetailState(nextTier, {
        columnConfig: resolvedColumnConfig,
      }),
    );
  };

  const openColumnDialog = () => {
    if (!canManage) {
      showManageDenied();
      return;
    }
    setDraftColumnConfig(normalizeRegionalCustomerListColumnConfig(resolvedColumnConfig));
    setNewColumnLabel("");
    setNewColumnCategory("custom");
    setColumnDialogOpen(true);
  };

  const closeColumnDialog = () => {
    setColumnDialogOpen(false);
    setDraftColumnConfig(normalizeRegionalCustomerListColumnConfig(resolvedColumnConfig));
    setNewColumnLabel("");
    setNewColumnCategory("custom");
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        tier,
        customerName: customerName.trim(),
        registrationCount: parseCount(registrationCount),
        sameCustomer: sameCustomer.trim(),
        detailColumns,
        csTimeline: buildTimelineText(editingItem?.csTimeline, timelineNote, Boolean(editingItem)),
      };

      if (editingItem) {
        const response = await apiRequest("PUT", `/api/regional-customer-list/${editingItem.id}`, payload);
        return response.json();
      }

      const response = await apiRequest("POST", "/api/regional-customer-list", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/regional-customer-list"] });
      toast({ title: editingItem ? "고객리스트를 수정했습니다." : "고객리스트를 등록했습니다." });
      closeDialog();
    },
    onError: (error) => {
      toast({
        title: error instanceof Error ? error.message : "고객리스트 저장에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/regional-customer-list/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/regional-customer-list"] });
      toast({ title: "고객리스트를 삭제했습니다." });
    },
    onError: (error) => {
      toast({
        title: error instanceof Error ? error.message : "고객리스트 삭제에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, nextDetailColumns }: { id: string; nextDetailColumns: RegionalCustomerListDetailState }) => {
      const response = await apiRequest("PUT", `/api/regional-customer-list/${id}`, {
        detailColumns: nextDetailColumns,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/regional-customer-list"] });
    },
    onError: (error) => {
      toast({
        title: error instanceof Error ? error.message : "체크값 저장에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const columnConfigMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", "/api/regional-customer-list/config", {
        columnConfig: draftColumnConfig,
      });
      return response.json() as Promise<RegionalCustomerListColumnConfigResponse>;
    },
    onSuccess: (response) => {
      queryClient.setQueryData(["/api/regional-customer-list/config"], response);
      queryClient.invalidateQueries({ queryKey: ["/api/regional-customer-list"] });
      toast({ title: `${activeTab} 회선 컬럼 설정을 저장했습니다.` });
      closeColumnDialog();
    },
    onError: (error) => {
      toast({
        title: error instanceof Error ? error.message : "컬럼 설정 저장에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (!canManage) {
      showManageDenied();
      return;
    }
    if (!customerName.trim()) {
      toast({ title: "고객명을 입력해주세요.", variant: "destructive" });
      return;
    }
    saveMutation.mutate();
  };

  const handleDelete = (item: RegionalCustomerListItem) => {
    if (!canManage) {
      showManageDenied();
      return;
    }
    const confirmed = window.confirm(`'${item.customerName}' 고객리스트를 삭제할까요?`);
    if (!confirmed) return;
    deleteMutation.mutate(item.id);
  };

  const handleInlineToggle = (
    item: RegionalCustomerListItem,
    detailKey: string,
    nextValue: boolean,
  ) => {
    if (!canManage) {
      showManageDenied();
      return;
    }

    const nextDetailColumns = {
      ...getItemDetailColumns(item, resolvedColumnConfig),
      [detailKey]: nextValue,
    };

    toggleMutation.mutate({
      id: item.id,
      nextDetailColumns,
    });
  };

  const handleAddColumn = () => {
    if (!canManage) {
      showManageDenied();
      return;
    }

    const label = newColumnLabel.trim();
    if (!label) {
      toast({ title: "추가할 컬럼명을 입력해주세요.", variant: "destructive" });
      return;
    }

    const nextKey = createRegionalCustomerListDetailColumnKey(
      label,
      activeDraftColumns.map((column) => column.key),
    );

    setDraftColumnConfig((current) => ({
      ...current,
      [activeTab]: [
        ...getTierDetailColumns(activeTab, current),
        {
          key: nextKey,
          label,
          category: newColumnCategory,
        },
      ],
    }));
    setNewColumnLabel("");
    setNewColumnCategory("custom");
  };

  const handleRemoveColumn = (columnKey: string) => {
    if (!canManage) {
      showManageDenied();
      return;
    }

    const target = activeDraftColumns.find((column) => column.key === columnKey);
    const confirmed = window.confirm(`'${target?.label || columnKey}' 컬럼을 삭제할까요?`);
    if (!confirmed) {
      return;
    }

    setDraftColumnConfig((current) => ({
      ...current,
      [activeTab]: getTierDetailColumns(activeTab, current).filter((column) => column.key !== columnKey),
    }));
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <List className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            고객리스트
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-none"
            onClick={openColumnDialog}
            disabled={!canManage}
            data-testid="button-manage-regional-customer-list-columns"
          >
            컬럼 관리
          </Button>
          <Button
            className="gap-2 rounded-none"
            onClick={openCreateDialog}
            disabled={!canManage}
            data-testid="button-create-regional-customer-list"
          >
            <Plus className="h-4 w-4" />
            등록
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((tab) => (
          <Button
            key={tab}
            type="button"
            variant={tab === activeTab ? "default" : "outline"}
            className="min-w-[88px] rounded-none"
            onClick={() => setActiveTab(tab)}
            data-testid={`button-regional-customer-list-tab-${tab}`}
          >
            {tab}
            <span className="ml-1 text-xs opacity-80">({(countsByTier[tab] || 0).toLocaleString()})</span>
          </Button>
        ))}
      </div>

      <Card className="rounded-none">
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table className="w-full table-auto" style={{ minWidth: `${tableMinWidth}px` }}>
              <colgroup>
                {tableColumnWidths.map((width, index) => (
                  <col key={`regional-customer-list-col-${index}`} style={{ width: `${width}px` }} />
                ))}
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">고객명</TableHead>
                  <TableHead className="whitespace-nowrap text-right">등록건수</TableHead>
                  <TableHead className="whitespace-nowrap">동일고객</TableHead>
                  {activeColumns.map((column) => (
                    <TableHead
                      key={`${activeTab}-${column.key}`}
                      className="whitespace-nowrap text-center"
                    >
                      {column.label}
                    </TableHead>
                  ))}
                  <TableHead className="whitespace-nowrap">CS / 타임라인</TableHead>
                  <TableHead className="whitespace-nowrap text-center">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, index) => (
                    <TableRow key={`regional-customer-list-skeleton-${index}`}>
                      <TableCell colSpan={tableColSpan}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : currentRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={tableColSpan} className="py-10 text-center text-muted-foreground">
                      등록된 고객리스트가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  currentRows.map((item) => {
                    const itemDetailColumns = getItemDetailColumns(item, resolvedColumnConfig);

                    return (
                      <TableRow key={item.id}>
                        <TableCell className="align-middle break-words font-medium">{item.customerName}</TableCell>
                        <TableCell className="align-middle text-right">
                          {Number(item.registrationCount || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="align-middle whitespace-pre-wrap break-words">
                          {item.sameCustomer || "-"}
                        </TableCell>
                        {activeColumns.map((column) => (
                          <TableCell key={`${item.id}-${column.key}`} className="align-middle text-center">
                            <div className="flex justify-center">
                              <Checkbox
                                checked={Boolean(itemDetailColumns[column.key])}
                                disabled={!canManage || toggleMutation.isPending}
                                onCheckedChange={(checked) =>
                                  handleInlineToggle(item, column.key, checked === true)
                                }
                                aria-label={`${item.customerName}-${column.label}`}
                              />
                            </div>
                          </TableCell>
                        ))}
                        <TableCell className="align-middle whitespace-pre-wrap break-words leading-6">
                          {item.csTimeline || "-"}
                        </TableCell>
                        <TableCell className="align-middle text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-none"
                              onClick={() => openEditDialog(item)}
                              disabled={!canManage}
                              data-testid={`button-edit-regional-customer-list-${item.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-none text-destructive hover:text-destructive"
                              onClick={() => handleDelete(item)}
                              disabled={!canManage || deleteMutation.isPending}
                              data-testid={`button-delete-regional-customer-list-${item.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
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

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">총 {(countsByTier[activeTab] || 0).toLocaleString()}건</span>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="rounded-none sm:max-w-[960px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? "고객리스트 수정" : "고객리스트 등록"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">구간</label>
              <select
                value={tier}
                onChange={(event) => handleTierChange(event.target.value as RegionalCustomerListTier)}
                className="flex h-10 w-full rounded-none border border-input bg-background px-3 py-2 text-sm"
                data-testid="select-regional-customer-list-tier"
              >
                {TABS.map((tab) => (
                  <option key={tab} value={tab}>
                    {tab}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">고객명</label>
              <Input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                className="rounded-none"
                data-testid="input-regional-customer-list-customer-name"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">등록건수</label>
              <Input
                type="number"
                min={0}
                value={registrationCount}
                onChange={(event) => setRegistrationCount(event.target.value)}
                className="rounded-none"
                data-testid="input-regional-customer-list-registration-count"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">동일고객</label>
              <Input
                value={sameCustomer}
                onChange={(event) => setSameCustomer(event.target.value)}
                className="rounded-none"
                data-testid="input-regional-customer-list-same-customer"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <label className="text-sm font-medium">구간별 관리 항목</label>
            <div className="grid grid-cols-1 gap-3 rounded-none border border-input p-4 md:grid-cols-2">
              {formColumns.length ? (
                formColumns.map((column) => (
                  <label key={`${tier}-${column.key}`} className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={Boolean(detailColumns[column.key])}
                      onCheckedChange={(checked) =>
                        setDetailColumns((current) => ({
                          ...current,
                          [column.key]: checked === true,
                        }))
                      }
                    />
                    {column.label}
                  </label>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">
                  현재 구간에는 등록된 컬럼이 없습니다. 컬럼 관리에서 먼저 컬럼을 추가하세요.
                </div>
              )}
            </div>
          </div>

          {editingItem?.csTimeline ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">기존 CS / 타임라인</label>
              <div className="max-h-[180px] min-h-[120px] overflow-auto rounded-none border border-input bg-muted/20 px-3 py-2 text-sm whitespace-pre-wrap leading-6">
                {editingItem.csTimeline}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium">{editingItem ? "CS / 타임라인 추가" : "CS / 타임라인"}</label>
            <Textarea
              value={timelineNote}
              onChange={(event) => setTimelineNote(event.target.value)}
              className="min-h-[140px] rounded-none"
              placeholder={
                editingItem
                  ? "추가할 내용을 입력하면 기존 내용 아래에 이어서 저장됩니다."
                  : "내용을 입력해주세요."
              }
              data-testid="textarea-regional-customer-list-cs-timeline"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-none" onClick={closeDialog}>
              취소
            </Button>
            <Button
              type="button"
              className="rounded-none"
              onClick={handleSave}
              disabled={!canManage || saveMutation.isPending}
              data-testid="button-save-regional-customer-list"
            >
              {saveMutation.isPending ? "저장 중..." : editingItem ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={columnDialogOpen} onOpenChange={(open) => (open ? setColumnDialogOpen(true) : closeColumnDialog())}>
        <DialogContent className="rounded-none sm:max-w-[820px]">
          <DialogHeader>
            <DialogTitle>{activeTab} 회선 컬럼 관리</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-none border border-input p-4">
              <div className="mb-3 text-sm font-medium">현재 컬럼</div>
              <div className="space-y-2">
                {activeDraftColumns.length ? (
                  activeDraftColumns.map((column) => (
                    <div
                      key={`${activeTab}-${column.key}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-none border border-border px-3 py-2"
                    >
                      <div className="space-y-1">
                        <div className="font-medium">{column.label}</div>
                        <div className="text-xs text-muted-foreground">
                          key: {column.key} / {getCategoryLabel(column.category)}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-none text-destructive hover:text-destructive"
                        onClick={() => handleRemoveColumn(column.key)}
                        disabled={columnConfigMutation.isPending}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        삭제
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">
                    등록된 컬럼이 없습니다. 아래에서 새 컬럼을 추가하세요.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-none border border-input p-4">
              <div className="mb-3 text-sm font-medium">컬럼 추가</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_auto]">
                <Input
                  value={newColumnLabel}
                  onChange={(event) => setNewColumnLabel(event.target.value)}
                  className="rounded-none"
                  placeholder="예: 노출 안내(5주차)"
                  data-testid="input-regional-customer-list-new-column-label"
                />
                <select
                  value={newColumnCategory}
                  onChange={(event) =>
                    setNewColumnCategory(event.target.value as RegionalCustomerListDetailCategory)
                  }
                  className="flex h-10 w-full rounded-none border border-input bg-background px-3 py-2 text-sm"
                  data-testid="select-regional-customer-list-new-column-category"
                >
                  {COLUMN_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  className="rounded-none"
                  onClick={handleAddColumn}
                  disabled={columnConfigMutation.isPending}
                  data-testid="button-add-regional-customer-list-column"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  추가
                </Button>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {COLUMN_CATEGORY_OPTIONS.find((option) => option.value === newColumnCategory)?.helper}
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                삭제한 컬럼은 화면에서 즉시 숨겨지고, 기존 체크 데이터는 다음 저장 시점부터 현재 컬럼 기준으로 정리됩니다.
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-none" onClick={closeColumnDialog}>
              취소
            </Button>
            <Button
              type="button"
              className="rounded-none"
              onClick={() => columnConfigMutation.mutate()}
              disabled={!canManage || columnConfigMutation.isPending}
              data-testid="button-save-regional-customer-list-columns"
            >
              {columnConfigMutation.isPending ? "저장 중..." : "컬럼 설정 저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
