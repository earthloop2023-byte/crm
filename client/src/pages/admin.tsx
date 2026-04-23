import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Database,
  Key,
  Link2,
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Play,
  Terminal,
  TableIcon,
  Layers,
  Clock,
  AlertTriangle,
} from "lucide-react";

type ColumnInfo = {
  name: string;
  type: string;
  maxLength: number | null;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignTable: string | null;
  foreignColumn: string | null;
};

type TableSchema = {
  name: string;
  columns: ColumnInfo[];
  rowCount: number;
};

type TableDataResponse = {
  rows: Record<string, any>[];
  total: number;
  limit: number;
  offset: number;
  columns: string[];
};

type SqlResponse = {
  rows: Record<string, any>[];
  fields: { name: string; dataTypeID: number }[];
  rowCount: number;
  totalRows: number;
  truncated: boolean;
  executionTime: number;
  command: string;
};

const TABLE_LABELS: Record<string, string> = {
  users: "사용자",
  customers: "고객",
  contacts: "담당자",
  deals: "거래",
  deal_timelines: "거래 타임라인",
  activities: "활동",
  payments: "수납",
  system_logs: "시스템 로그",
  products: "상품",
  contracts: "계약",
  refunds: "환불",
  keeps: "킵",
  deposits: "입금",
  notices: "공지사항",
  page_permissions: "페이지 권한",
  system_settings: "시스템 설정",
  database_backups: "데이터베이스 백업",
  session: "세션",
};

function SchemaTab() {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const { data: schema = [], isLoading } = useQuery<TableSchema[]>({
    queryKey: ["/api/admin/schema"],
  });

  const selected = schema.find((t) => t.name === selectedTable);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-240px)] min-h-[400px]">
      <div className="w-64 shrink-0 overflow-y-auto border rounded-md">
        <div className="p-3 border-b">
          <p className="text-sm font-medium text-muted-foreground">테이블 목록</p>
        </div>
        <div className="p-1">
          {schema.map((table) => (
            <button
              key={table.name}
              onClick={() => setSelectedTable(table.name)}
              className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                selectedTable === table.name
                  ? "bg-accent font-medium"
                  : "hover-elevate"
              }`}
              data-testid={`schema-table-${table.name}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{TABLE_LABELS[table.name] || table.name}</span>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {table.rowCount}
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">{table.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto border rounded-md">
        {selected ? (
          <div>
            <div className="p-4 border-b">
              <div className="flex items-center gap-2">
                <TableIcon className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-semibold">{TABLE_LABELS[selected.name] || selected.name}</h3>
                <Badge variant="outline" className="text-xs">{selected.name}</Badge>
                <Badge variant="secondary" className="text-xs">{selected.columns.length}개 컬럼</Badge>
                <Badge variant="secondary" className="text-xs">{selected.rowCount}개 행</Badge>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">컬럼명</TableHead>
                  <TableHead className="w-[140px]">타입</TableHead>
                  <TableHead className="w-[80px]">NULL</TableHead>
                  <TableHead className="w-[80px]">키</TableHead>
                  <TableHead>기본값</TableHead>
                  <TableHead>참조</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selected.columns.map((col) => (
                  <TableRow key={col.name}>
                    <TableCell className="font-mono text-sm">{col.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {col.type}{col.maxLength ? `(${col.maxLength})` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={col.nullable ? "secondary" : "outline"} className="text-xs">
                        {col.nullable ? "YES" : "NO"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {col.isPrimaryKey && (
                          <Key className="w-3.5 h-3.5 text-amber-500" />
                        )}
                        {col.isForeignKey && (
                          <Link2 className="w-3.5 h-3.5 text-blue-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono max-w-[200px] truncate">
                      {col.defaultValue || "-"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {col.foreignTable ? `${col.foreignTable}.${col.foreignColumn}` : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Layers className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">테이블을 선택하면 스키마를 확인할 수 있습니다</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DataTab() {
  const { toast } = useToast();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [editRow, setEditRow] = useState<Record<string, any> | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, any>>({});
  const [deleteTarget, setDeleteTarget] = useState<{ table: string; id: string } | null>(null);
  const pageSize = 30;

  const { data: schema = [] } = useQuery<TableSchema[]>({
    queryKey: ["/api/admin/schema"],
  });

  const { data: tableData, isLoading: isDataLoading } = useQuery<TableDataResponse>({
    queryKey: ["/api/admin/tables", selectedTable, "rows", page, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
        orderBy: "id",
        orderDir: "desc",
      });
      if (searchQuery) params.set("search", searchQuery);
      const res = await fetch(`/api/admin/tables/${selectedTable}/rows?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch data");
      return res.json();
    },
    enabled: !!selectedTable,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ table, id, data }: { table: string; id: string; data: Record<string, any> }) => {
      await apiRequest("PUT", `/api/admin/tables/${table}/rows/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tables"] });
      toast({ title: "수정 완료" });
      setEditRow(null);
      setEditedValues({});
    },
    onError: () => toast({ title: "수정 실패", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ table, id }: { table: string; id: string }) => {
      await apiRequest("DELETE", `/api/admin/tables/${table}/rows/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tables"] });
      toast({ title: "삭제 완료" });
      setDeleteTarget(null);
    },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const totalPages = tableData ? Math.ceil(tableData.total / pageSize) : 0;

  const handleSelectTable = useCallback((name: string) => {
    setSelectedTable(name);
    setPage(0);
    setSearchQuery("");
  }, []);

  const handleEditRow = (row: Record<string, any>) => {
    setEditRow(row);
    setEditedValues({});
  };

  const truncateValue = (val: any): string => {
    if (val === null || val === undefined) return "";
    const str = typeof val === "object" ? JSON.stringify(val) : String(val);
    return str.length > 60 ? str.substring(0, 60) + "..." : str;
  };

  const displayColumns = tableData?.columns?.filter((c) => c !== "password" && c !== "data") || [];

  return (
    <div className="flex gap-4 h-[calc(100vh-240px)] min-h-[400px]">
      <div className="w-56 shrink-0 overflow-y-auto border rounded-md">
        <div className="p-3 border-b">
          <p className="text-sm font-medium text-muted-foreground">테이블</p>
        </div>
        <div className="p-1">
          {schema.map((table) => (
            <button
              key={table.name}
              onClick={() => handleSelectTable(table.name)}
              className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                selectedTable === table.name ? "bg-accent font-medium" : "hover-elevate"
              }`}
              data-testid={`data-table-${table.name}`}
            >
              <span className="truncate">{TABLE_LABELS[table.name] || table.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden border rounded-md">
        {selectedTable ? (
          <>
            <div className="p-3 border-b flex items-center gap-3 flex-wrap">
              <h3 className="font-semibold text-sm shrink-0">{TABLE_LABELS[selectedTable] || selectedTable}</h3>
              <Badge variant="outline" className="text-xs">{tableData?.total || 0}건</Badge>
              <div className="flex-1" />
              <div className="relative w-60">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="검색..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
                  className="pl-8 text-sm"
                  data-testid="input-data-search"
                />
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              {isDataLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : tableData && tableData.rows.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {displayColumns.map((col) => (
                        <TableHead key={col} className="text-xs whitespace-nowrap">{col}</TableHead>
                      ))}
                      <TableHead className="w-[80px] text-xs">작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableData.rows.map((row, idx) => (
                      <TableRow key={row.id || idx}>
                        {displayColumns.map((col) => (
                          <TableCell key={col} className="text-xs max-w-[200px] truncate font-mono">
                            {truncateValue(row[col])}
                          </TableCell>
                        ))}
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleEditRow(row)}
                              data-testid={`button-edit-row-${row.id || idx}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteTarget({ table: selectedTable, id: String(row.id) })}
                              data-testid={`button-delete-row-${row.id || idx}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                  데이터가 없습니다
                </div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="p-3 border-t flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {page * pageSize + 1}-{Math.min((page + 1) * pageSize, tableData?.total || 0)} / {tableData?.total || 0}건
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs px-2">{page + 1} / {totalPages}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                    data-testid="button-next-page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <TableIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">테이블을 선택하세요</p>
            </div>
          </div>
        )}
      </div>

      {editRow && selectedTable && (
        <Dialog open={!!editRow} onOpenChange={() => { setEditRow(null); setEditedValues({}); }}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>데이터 수정</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {Object.entries(editRow)
                .filter(([key]) => key !== "id" && key !== "password" && key !== "data")
                .map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs font-mono">{key}</Label>
                    <Input
                      value={editedValues[key] !== undefined ? editedValues[key] : (value ?? "")}
                      onChange={(e) => setEditedValues((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="text-sm font-mono"
                      data-testid={`input-edit-${key}`}
                    />
                  </div>
                ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditRow(null); setEditedValues({}); }}>취소</Button>
              <Button
                onClick={() => {
                  if (Object.keys(editedValues).length > 0) {
                    updateMutation.mutate({ table: selectedTable, id: String(editRow.id), data: editedValues });
                  } else {
                    setEditRow(null);
                  }
                }}
                disabled={updateMutation.isPending}
                data-testid="button-save-edit"
              >
                {updateMutation.isPending ? "저장중..." : "저장"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>데이터 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 데이터를 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SqlTab() {
  const { toast } = useToast();
  const [query, setQuery] = useState("SELECT * FROM users LIMIT 10;");
  const [allowWrite, setAllowWrite] = useState(false);
  const [result, setResult] = useState<SqlResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const executeMutation = useMutation({
    mutationFn: async (sql: string) => {
      const res = await apiRequest("POST", "/api/admin/sql", { query: sql, allowWrite });
      return res.json() as Promise<SqlResponse>;
    },
    onSuccess: (data) => {
      setResult(data);
      setError(null);
    },
    onError: async (err: any) => {
      setResult(null);
      try {
        const body = await err.response?.json?.();
        setError(body?.error || err.message || "SQL 실행 오류");
      } catch {
        setError(err.message || "SQL 실행 오류");
      }
    },
  });

  const handleExecute = () => {
    if (!query.trim()) {
      toast({ title: "SQL 쿼리를 입력하세요", variant: "destructive" });
      return;
    }
    setError(null);
    executeMutation.mutate(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleExecute();
    }
  };

  return (
    <div className="space-y-4 h-[calc(100vh-240px)] min-h-[400px] flex flex-col">
      <div className="space-y-3">
        <div className="border rounded-md overflow-hidden">
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="SELECT * FROM users LIMIT 10;"
            className="font-mono text-sm border-0 resize-none focus-visible:ring-0 min-h-[120px]"
            data-testid="textarea-sql"
          />
        </div>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Button
              onClick={handleExecute}
              disabled={executeMutation.isPending}
              data-testid="button-execute-sql"
            >
              <Play className="w-4 h-4 mr-2" />
              {executeMutation.isPending ? "실행중..." : "실행"}
            </Button>
            <span className="text-xs text-muted-foreground">Ctrl+Enter로 실행</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="allow-write"
              checked={allowWrite}
              onCheckedChange={setAllowWrite}
              data-testid="switch-allow-write"
            />
            <Label htmlFor="allow-write" className="text-sm flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              쓰기 허용
            </Label>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto border rounded-md">
        {error ? (
          <div className="p-4">
            <div className="text-destructive text-sm font-mono whitespace-pre-wrap">{error}</div>
          </div>
        ) : result ? (
          <div className="flex flex-col h-full">
            <div className="p-3 border-b flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {result.executionTime}ms
              </span>
              <span>{result.command}</span>
              <span>{result.rowCount ?? result.totalRows}건</span>
              {result.truncated && (
                <Badge variant="secondary" className="text-xs">결과 제한됨 (500행)</Badge>
              )}
            </div>
            {result.rows.length > 0 ? (
              <div className="overflow-auto flex-1">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {result.fields.map((f) => (
                        <TableHead key={f.name} className="text-xs whitespace-nowrap">{f.name}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows.map((row, idx) => (
                      <TableRow key={idx}>
                        {result.fields.map((f) => (
                          <TableCell key={f.name} className="text-xs max-w-[300px] truncate font-mono">
                            {row[f.name] === null ? <span className="text-muted-foreground italic">NULL</span> : 
                              typeof row[f.name] === "object" ? JSON.stringify(row[f.name]) : String(row[f.name])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                결과 없음 (영향받은 행: {result.rowCount})
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Terminal className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">SQL 쿼리를 실행하면 결과가 여기에 표시됩니다</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <div className="p-6 space-y-6 max-w-full mx-auto">
      <div className="flex items-center gap-3">
        <Database className="w-6 h-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">개발자 어드민</h1>
          <p className="text-sm text-muted-foreground">데이터베이스 스키마 확인, 데이터 관리 및 SQL 콘솔</p>
        </div>
      </div>

      <Tabs defaultValue="schema" className="w-full">
        <TabsList data-testid="tabs-admin">
          <TabsTrigger value="schema" data-testid="tab-schema">
            <Layers className="w-4 h-4 mr-1.5" />
            스키마
          </TabsTrigger>
          <TabsTrigger value="data" data-testid="tab-data">
            <TableIcon className="w-4 h-4 mr-1.5" />
            데이터
          </TabsTrigger>
          <TabsTrigger value="sql" data-testid="tab-sql">
            <Terminal className="w-4 h-4 mr-1.5" />
            SQL 콘솔
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schema" className="mt-4">
          <SchemaTab />
        </TabsContent>
        <TabsContent value="data" className="mt-4">
          <DataTab />
        </TabsContent>
        <TabsContent value="sql" className="mt-4">
          <SqlTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
