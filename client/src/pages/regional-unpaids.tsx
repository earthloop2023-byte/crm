import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Search, Upload } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

type RegionalUnpaidColumn = {
  key: string;
  label: string;
};

type RegionalUnpaidResponse = {
  columns: RegionalUnpaidColumn[];
  rows: Record<string, unknown>[];
  importedCount: number;
  excludedCount: number;
  uploadedAt: string | null;
  uploadedBy: string | null;
};

const EMPTY_DATA: RegionalUnpaidResponse = {
  columns: [],
  rows: [],
  importedCount: 0,
  excludedCount: 0,
  uploadedAt: null,
  uploadedBy: null,
};

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

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value.trim() ? value : "-";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString() : "-";
  if (typeof value === "boolean") return value ? "Y" : "N";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function RegionalUnpaidsPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const { data = EMPTY_DATA, isLoading } = useQuery<RegionalUnpaidResponse>({
    queryKey: ["/api/regional-unpaids"],
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/regional-unpaids/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res, "미납 엑셀 업로드에 실패했습니다."));
      }
      return res.json() as Promise<{ importedCount: number; excludedCount: number }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/regional-unpaids"] });
      setCurrentPage(1);
      toast({ title: `엑셀 업로드 완료: ${result.importedCount}건 반영, ${result.excludedCount}건 제외` });
    },
    onError: (error) => {
      toast({
        title: error instanceof Error ? error.message : "미납 엑셀 업로드에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return data.rows;

    return data.rows.filter((row) =>
      data.columns.some((column) => String(row?.[column.key] ?? "").toLowerCase().includes(q)),
    );
  }, [data.columns, data.rows, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / itemsPerPage));
  const currentRows = filteredRows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    uploadMutation.mutate(file);
  };

  const columnCount = Math.max(data.columns.length, 1);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-500" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            미납
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
              placeholder="미납 데이터 검색"
              className="pl-9 w-72 rounded-none"
              data-testid="input-regional-unpaid-search"
            />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />

          <Button
            variant="outline"
            className="gap-2 rounded-none"
            onClick={handleUploadClick}
            disabled={uploadMutation.isPending}
            data-testid="button-regional-unpaid-upload"
          >
            <Upload className="w-4 h-4" />
            {uploadMutation.isPending ? "업로드 중..." : "엑셀 업로드"}
          </Button>
        </div>
      </div>

      <Card className="rounded-none">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="space-y-1">
            <div>반영 건수: <span className="font-semibold">{data.importedCount}건</span></div>
            <div>제외 건수(대상안내=장기연체고객/직원해지대상): <span className="font-semibold text-red-500">{data.excludedCount}건</span></div>
            <div>검색 결과: <span className="font-semibold">{filteredRows.length}건</span></div>
          </div>
          <div className="space-y-1 text-muted-foreground md:col-span-2">
            <div>
              마지막 업로드: {data.uploadedAt ? new Date(data.uploadedAt).toLocaleString("ko-KR") : "-"}
            </div>
            <div>
              업로더: {data.uploadedBy || "-"}
            </div>
            <div>
              컬럼 수: {data.columns.length}개
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
                  {data.columns.length > 0 ? (
                    data.columns.map((column) => (
                      <TableHead key={column.key} className="whitespace-nowrap">
                        {column.label}
                      </TableHead>
                    ))
                  ) : (
                    <TableHead className="whitespace-nowrap">컬럼 정보가 없습니다.</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell colSpan={columnCount}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : currentRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columnCount} className="text-center py-10 text-muted-foreground">
                      업로드된 미납 데이터가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  currentRows.map((row, rowIndex) => (
                    <TableRow key={`row-${rowIndex}`}>
                      {data.columns.map((column) => (
                        <TableCell key={`${rowIndex}-${column.key}`} className="whitespace-nowrap">
                          {formatCellValue(row?.[column.key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">총 {filteredRows.length}건</span>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>
    </div>
  );
}
