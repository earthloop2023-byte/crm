import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Trash2, Eye, Download } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import type { ImportBatch, ImportStagingRow } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type StepKey = "upload" | "preview" | "validate" | "commit";

const steps: { key: StepKey; label: string; index: number }[] = [
  { key: "upload", label: "파일 업로드", index: 0 },
  { key: "preview", label: "데이터 미리보기", index: 1 },
  { key: "validate", label: "검증", index: 2 },
  { key: "commit", label: "확정", index: 3 },
];

interface SheetInfo {
  name: string;
  rowCount: number;
  detectedType: string;
}

export default function BulkImportPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentStep, setCurrentStep] = useState<StepKey>("upload");
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [stagingRows, setStagingRows] = useState<ImportStagingRow[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [availableSheets, setAvailableSheets] = useState<SheetInfo[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<{
    validCount: number;
    errorCount: number;
    errors: Array<{ rowIndex: number; errors: string[] }>;
  } | null>(null);
  const [commitResult, setCommitResult] = useState<{
    importedCount: number;
  } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);

  const { data: batches = [], isLoading: batchesLoading } = useQuery<ImportBatch[]>({
    queryKey: ["/api/bulk-import/batches"],
  });

  const { data: batchDetail } = useQuery<{ batch: ImportBatch; rows: ImportStagingRow[] }>({
    queryKey: ["/api/bulk-import/batches", currentBatchId],
    enabled: !!currentBatchId && currentStep !== "upload",
  });

  const currentBatch = batchDetail?.batch;

  const uploadMutation = useMutation({
    mutationFn: async ({ file, sheetName }: { file: File; sheetName?: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      if (sheetName) {
        formData.append("sheetName", sheetName);
      }
      const res = await fetch("/api/bulk-import/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.needsSelection && data.sheets) {
        setAvailableSheets(data.sheets);
        return;
      }
      setAvailableSheets([]);
      setPendingFile(null);
      setCurrentBatchId(data.batch.id);
      setStagingRows(data.rows || []);
      setValidationResult(null);
      setCommitResult(null);
      queryClient.invalidateQueries({ queryKey: ["/api/bulk-import/batches"] });
      toast({ title: "파일이 업로드되었습니다." });
      setCurrentStep("preview");
    },
    onError: (error: Error) => {
      toast({ title: "파일 업로드에 실패했습니다.", description: error.message, variant: "destructive" });
    },
  });

  const handleSheetSelect = (sheetName: string) => {
    if (pendingFile) {
      uploadMutation.mutate({ file: pendingFile, sheetName });
    }
  };

  const validateMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const res = await apiRequest("POST", `/api/bulk-import/batches/${batchId}/validate`);
      return res.json();
    },
    onSuccess: (data: { batch: ImportBatch; validCount: number; errorCount: number; errors: Array<{ rowIndex: number; errors: string[] }> }) => {
      setValidationResult({
        validCount: data.validCount,
        errorCount: data.errorCount,
        errors: data.errors,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/bulk-import/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bulk-import/batches", currentBatchId] });
      toast({ title: "검증이 완료되었습니다." });
    },
    onError: () => {
      toast({ title: "검증에 실패했습니다.", variant: "destructive" });
    },
  });

  const commitMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const res = await apiRequest("POST", `/api/bulk-import/batches/${batchId}/commit`);
      return res.json();
    },
    onSuccess: (data: { batch: ImportBatch; importedCount: number; results: unknown }) => {
      setCommitResult({ importedCount: data.importedCount });
      queryClient.invalidateQueries({ queryKey: ["/api/bulk-import/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      toast({ title: `${data.importedCount}건이 등록되었습니다.` });
    },
    onError: () => {
      toast({ title: "확정에 실패했습니다.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (batchId: string) => {
      await apiRequest("DELETE", `/api/bulk-import/batches/${batchId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bulk-import/batches"] });
      setDeleteDialogOpen(false);
      setDeletingBatchId(null);
      toast({ title: "배치가 삭제되었습니다." });
    },
    onError: () => {
      toast({ title: "삭제에 실패했습니다.", variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
      setAvailableSheets([]);
      uploadMutation.mutate({ file });
      e.target.value = "";
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
      setPendingFile(file);
      setAvailableSheets([]);
      uploadMutation.mutate({ file });
    } else {
      toast({ title: ".xlsx 또는 .xls 파일만 업로드 가능합니다.", variant: "destructive" });
    }
  }, [uploadMutation, toast]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleViewBatch = (batch: ImportBatch) => {
    setCurrentBatchId(batch.id);
    setStagingRows([]);
    setValidationResult(null);
    setCommitResult(null);
    setCurrentStep("preview");
  };

  const handleDeleteClick = (batchId: string) => {
    setDeletingBatchId(batchId);
    setDeleteDialogOpen(true);
  };

  const handleReset = () => {
    setCurrentStep("upload");
    setCurrentBatchId(null);
    setStagingRows([]);
    setValidationResult(null);
    setCommitResult(null);
    setAvailableSheets([]);
    setPendingFile(null);
  };

  const formatAmount = (amount: number | null | undefined) => {
    if (amount == null) return "-";
    return new Intl.NumberFormat("ko-KR").format(amount);
  };

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return "-";
    try {
      return format(new Date(date), "yyyy-MM-dd", { locale: ko });
    } catch {
      return "-";
    }
  };

  const displayRows = batchDetail?.rows || stagingRows;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="rounded-none text-xs">대기</Badge>;
      case "validated":
        return <Badge variant="outline" className="rounded-none text-xs">검증완료</Badge>;
      case "committed":
        return <Badge variant="default" className="rounded-none text-xs bg-green-600">확정</Badge>;
      case "error":
        return <Badge variant="destructive" className="rounded-none text-xs">오류</Badge>;
      default:
        return <Badge variant="secondary" className="rounded-none text-xs">{status}</Badge>;
    }
  };

  const currentStepIndex = steps.find(s => s.key === currentStep)?.index ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Upload className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">대량등록</h1>
        </div>
        {currentStep !== "upload" && (
          <Button
            variant="outline"
            className="rounded-none"
            onClick={handleReset}
            data-testid="button-reset"
          >
            새 업로드
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {steps.map((step, i) => (
          <div key={step.key} className="flex items-center gap-2">
            <Button
              variant={currentStep === step.key ? "default" : "outline"}
              size="sm"
              className="rounded-none gap-2"
              onClick={() => {
                if (step.index <= currentStepIndex || (currentBatchId && step.index <= 3)) {
                  setCurrentStep(step.key);
                }
              }}
              disabled={!currentBatchId && step.key !== "upload"}
              data-testid={`button-step-${step.key}`}
            >
              <span className="text-xs font-bold">{i + 1}</span>
              {step.label}
            </Button>
            {i < steps.length - 1 && (
              <div className="w-8 h-px bg-border" />
            )}
          </div>
        ))}
      </div>

      {currentStep === "upload" && (
        <Card className="rounded-none">
          <CardContent className="p-8">
            <div
              className={`border-2 border-dashed p-12 text-center transition-colors ${
                isDragOver ? "border-primary bg-primary/5" : "border-border"
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              data-testid="dropzone-upload"
            >
              <FileSpreadsheet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium mb-2">엑셀 파일을 드래그하여 업로드</p>
              <p className="text-sm text-muted-foreground mb-6">.xlsx, .xls 파일만 지원됩니다</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
                data-testid="input-file-upload"
              />
              <Button
                className="rounded-none gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
                data-testid="button-select-file"
              >
                <Upload className="w-4 h-4" />
                {uploadMutation.isPending ? "업로드 중..." : "파일 선택"}
              </Button>
              {uploadMutation.isPending && (
                <div className="mt-6 max-w-sm mx-auto">
                  <Progress value={66} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-2">파일을 처리하고 있습니다...</p>
                </div>
              )}
            </div>

            {availableSheets.length > 0 && (
              <div className="mt-6 border-t pt-6">
                <p className="text-sm font-medium mb-3">가져올 시트를 선택하세요</p>
                <p className="text-xs text-muted-foreground mb-4">
                  파일: {pendingFile?.name}
                </p>
                <div className="grid gap-2">
                  {availableSheets.map((sheet) => (
                    <Button
                      key={sheet.name}
                      variant="outline"
                      className="justify-between rounded-none h-auto py-3 px-4 gap-4"
                      onClick={() => handleSheetSelect(sheet.name)}
                      disabled={uploadMutation.isPending || sheet.rowCount === 0}
                      data-testid={`button-sheet-${sheet.name}`}
                    >
                      <span className="text-left truncate flex-1">{sheet.name}</span>
                      <span className="flex items-center gap-3 flex-shrink-0">
                        <Badge variant={sheet.detectedType === "기타" ? "secondary" : "default"}>
                          {sheet.detectedType}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{sheet.rowCount}행</span>
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {currentStep === "preview" && (
        <div className="space-y-4">
          {currentBatch && (
            <Card className="rounded-none">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">파일명</p>
                    <p className="text-sm font-medium mt-1" data-testid="text-batch-filename">{currentBatch.fileName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">시트유형</p>
                    <p className="text-sm font-medium mt-1" data-testid="text-batch-sheettype">{currentBatch.sheetType}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">전체 행</p>
                    <p className="text-sm font-medium mt-1" data-testid="text-batch-totalrows">{currentBatch.totalRows}건</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">유효 행</p>
                    <p className="text-sm font-medium mt-1 text-green-500" data-testid="text-batch-validrows">{currentBatch.validRows}건</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">오류 행</p>
                    <p className="text-sm font-medium mt-1 text-red-500" data-testid="text-batch-errorrows">{currentBatch.errorRows}건</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="rounded-none">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs font-medium text-center whitespace-nowrap">행</TableHead>
                      <TableHead className="text-xs font-medium text-center whitespace-nowrap">계약일</TableHead>
                      <TableHead className="text-xs font-medium text-center whitespace-nowrap">고객명</TableHead>
                      <TableHead className="text-xs font-medium text-center whitespace-nowrap">상품명</TableHead>
                      <TableHead className="text-xs font-medium text-center whitespace-nowrap">단가</TableHead>
                      <TableHead className="text-xs font-medium text-center whitespace-nowrap">비용</TableHead>
                      <TableHead className="text-xs font-medium text-center whitespace-nowrap">공급가</TableHead>
                      <TableHead className="text-xs font-medium text-center whitespace-nowrap">부가세</TableHead>
                      <TableHead className="text-xs font-medium text-center whitespace-nowrap">수납</TableHead>
                      <TableHead className="text-xs font-medium text-center whitespace-nowrap">비고</TableHead>
                      <TableHead className="text-xs font-medium text-center whitespace-nowrap">상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="p-12 text-center text-muted-foreground">
                          데이터가 없습니다.
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayRows.map((row) => (
                        <TableRow
                          key={row.id}
                          className={row.isValid === false ? "bg-red-500/10" : "hover:bg-muted/20"}
                          data-testid={`row-staging-${row.rowIndex}`}
                        >
                          <TableCell className="text-xs text-center">{row.rowIndex}</TableCell>
                          <TableCell className="text-xs text-center whitespace-nowrap">{formatDate(row.contractDate)}</TableCell>
                          <TableCell className="text-xs text-center whitespace-nowrap">{row.customerName || "-"}</TableCell>
                          <TableCell className="text-xs text-center whitespace-nowrap">{row.productName || "-"}</TableCell>
                          <TableCell className="text-xs text-center whitespace-nowrap">{formatAmount(row.unitPrice)}</TableCell>
                          <TableCell className="text-xs text-center whitespace-nowrap">{formatAmount(row.cost)}</TableCell>
                          <TableCell className="text-xs text-center whitespace-nowrap">{formatAmount(row.supplyAmount)}</TableCell>
                          <TableCell className="text-xs text-center whitespace-nowrap">{formatAmount(row.vatAmount)}</TableCell>
                          <TableCell className="text-xs text-center whitespace-nowrap">
                            {row.paymentConfirmed === "수납완료" ? (
                              <Badge variant="default" className="rounded-none text-xs bg-green-600">수납완료</Badge>
                            ) : (
                              row.paymentConfirmed || "-"
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-center max-w-[200px] truncate">{row.notes || "-"}</TableCell>
                          <TableCell className="text-xs text-center">
                            {row.isValid === false ? (
                              <div className="flex flex-col items-center gap-1">
                                <AlertCircle className="w-4 h-4 text-red-500" />
                                {row.errors && (
                                  <span className="text-[10px] text-red-500 max-w-[150px] truncate">{row.errors}</span>
                                )}
                              </div>
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              className="rounded-none gap-2"
              onClick={() => setCurrentStep("validate")}
              data-testid="button-go-validate"
            >
              검증 단계로
            </Button>
          </div>
        </div>
      )}

      {currentStep === "validate" && (
        <div className="space-y-4">
          <Card className="rounded-none">
            <CardContent className="p-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="text-lg font-semibold">데이터 검증</h3>
                  <p className="text-sm text-muted-foreground mt-1">업로드된 데이터의 유효성을 검증합니다.</p>
                </div>
                <Button
                  className="rounded-none gap-2"
                  onClick={() => currentBatchId && validateMutation.mutate(currentBatchId)}
                  disabled={!currentBatchId || validateMutation.isPending}
                  data-testid="button-validate"
                >
                  {validateMutation.isPending ? (
                    <>검증 중...</>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      검증 실행
                    </>
                  )}
                </Button>
              </div>

              {validateMutation.isPending && (
                <div className="mt-4">
                  <Progress value={50} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-2">데이터를 검증하고 있습니다...</p>
                </div>
              )}
            </CardContent>
          </Card>

          {validationResult && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <Card className="rounded-none">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">전체</p>
                    <p className="text-xl font-bold mt-1" data-testid="text-validate-total">
                      {validationResult.validCount + validationResult.errorCount}건
                    </p>
                  </CardContent>
                </Card>
                <Card className="rounded-none">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">유효</p>
                    <p className="text-xl font-bold mt-1 text-green-500" data-testid="text-validate-valid">
                      {validationResult.validCount}건
                    </p>
                  </CardContent>
                </Card>
                <Card className="rounded-none">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">오류</p>
                    <p className="text-xl font-bold mt-1 text-red-500" data-testid="text-validate-invalid">
                      {validationResult.errorCount}건
                    </p>
                  </CardContent>
                </Card>
              </div>

              {validationResult.errors.length > 0 && (
                <Card className="rounded-none">
                  <CardContent className="p-4">
                    <h4 className="text-sm font-semibold mb-3">오류 목록</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {validationResult.errors.map((err, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 p-3 bg-red-500/5 border border-red-500/20"
                          data-testid={`error-row-${err.rowIndex}`}
                        >
                          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-medium">행 {err.rowIndex}</p>
                            <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                              {err.errors.map((msg, j) => (
                                <li key={j}>{msg}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end">
                <Button
                  className="rounded-none gap-2"
                  onClick={() => setCurrentStep("commit")}
                  disabled={validationResult.validCount === 0}
                  data-testid="button-go-commit"
                >
                  확정 단계로
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {currentStep === "commit" && (
        <div className="space-y-4">
          <Card className="rounded-none">
            <CardContent className="p-6">
              {!commitResult ? (
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">데이터 확정</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      검증된 데이터를 시스템에 등록합니다.
                      {validationResult && (
                        <span className="ml-1 font-medium text-green-500">
                          ({validationResult.validCount}건 등록 예정)
                        </span>
                      )}
                    </p>
                  </div>
                  <Button
                    className="rounded-none gap-2"
                    onClick={() => currentBatchId && commitMutation.mutate(currentBatchId)}
                    disabled={!currentBatchId || commitMutation.isPending || (validationResult?.validCount ?? 0) === 0}
                    data-testid="button-commit"
                  >
                    {commitMutation.isPending ? (
                      <>등록 중...</>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        확정 실행
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold mb-2">등록 완료</h3>
                  <p className="text-muted-foreground" data-testid="text-commit-result">
                    총 {commitResult.importedCount}건이 시스템에 등록되었습니다.
                  </p>
                  <Button
                    variant="outline"
                    className="rounded-none mt-6"
                    onClick={handleReset}
                    data-testid="button-new-upload"
                  >
                    새 업로드
                  </Button>
                </div>
              )}

              {commitMutation.isPending && (
                <div className="mt-4">
                  <Progress value={75} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-2">데이터를 등록하고 있습니다...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold" data-testid="text-batch-history-title">업로드 이력</h2>
        <Card className="rounded-none">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs font-medium text-center whitespace-nowrap">파일명</TableHead>
                    <TableHead className="text-xs font-medium text-center whitespace-nowrap">시트유형</TableHead>
                    <TableHead className="text-xs font-medium text-center whitespace-nowrap">전체행</TableHead>
                    <TableHead className="text-xs font-medium text-center whitespace-nowrap">등록행</TableHead>
                    <TableHead className="text-xs font-medium text-center whitespace-nowrap">상태</TableHead>
                    <TableHead className="text-xs font-medium text-center whitespace-nowrap">생성일</TableHead>
                    <TableHead className="text-xs font-medium text-center whitespace-nowrap">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchesLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : batches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="p-12 text-center text-muted-foreground">
                        업로드 이력이 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : (
                    batches.map((batch) => (
                      <TableRow key={batch.id} className="hover:bg-muted/20" data-testid={`row-batch-${batch.id}`}>
                        <TableCell className="text-xs text-center whitespace-nowrap font-medium">{batch.fileName}</TableCell>
                        <TableCell className="text-xs text-center whitespace-nowrap">{batch.sheetType}</TableCell>
                        <TableCell className="text-xs text-center whitespace-nowrap">{batch.totalRows}</TableCell>
                        <TableCell className="text-xs text-center whitespace-nowrap">{batch.importedRows || 0}</TableCell>
                        <TableCell className="text-xs text-center whitespace-nowrap">{getStatusBadge(batch.status)}</TableCell>
                        <TableCell className="text-xs text-center whitespace-nowrap">{formatDate(batch.createdAt)}</TableCell>
                        <TableCell className="text-xs text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleViewBatch(batch)}
                              data-testid={`button-view-batch-${batch.id}`}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteClick(batch.id)}
                              data-testid={`button-delete-batch-${batch.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
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
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="rounded-none">
          <DialogHeader>
            <DialogTitle>배치 삭제</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">이 배치를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</p>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setDeleteDialogOpen(false)}
              data-testid="button-cancel-delete"
            >
              취소
            </Button>
            <Button
              variant="destructive"
              className="rounded-none"
              onClick={() => deletingBatchId && deleteMutation.mutate(deletingBatchId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
