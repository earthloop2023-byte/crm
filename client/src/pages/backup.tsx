import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSettings } from "@/lib/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Database, Download, Trash2, RotateCcw, Plus, HardDrive, Clock, User } from "lucide-react";

const TABLE_LABELS: Record<string, string> = {
  users: "사용자",
  customers: "고객",
  contacts: "담당자",
  deals: "거래",
  dealTimelines: "거래 타임라인",
  activities: "활동",
  payments: "수납",
  products: "상품",
  contracts: "계약",
  refunds: "환불",
  keeps: "킵",
  deposits: "입금",
  notices: "공지사항",
  pagePermissions: "페이지 권한",
  systemSettings: "시스템 설정",
  systemLogs: "시스템 로그",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type BackupMeta = {
  id: string;
  label: string | null;
  createdByName: string;
  createdByUserId: string | null;
  tableCounts: string | null;
  sizeBytes: number | null;
  createdAt: string;
};

export default function BackupPage() {
  const { toast } = useToast();
  const { formatDateTime } = useSettings();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [backupLabel, setBackupLabel] = useState("");
  const [restoreId, setRestoreId] = useState<string | null>(null);

  const { data: backups = [], isLoading } = useQuery<BackupMeta[]>({
    queryKey: ["/api/backups"],
  });

  const createMutation = useMutation({
    mutationFn: async (label: string) => {
      const res = await apiRequest("POST", "/api/backups", { label: label || undefined });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/backups"] });
      toast({ title: "백업 생성 완료", description: "데이터 백업이 성공적으로 생성되었습니다." });
      setShowCreateDialog(false);
      setBackupLabel("");
    },
    onError: () => {
      toast({ title: "백업 실패", description: "백업 생성에 실패했습니다.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/backups/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/backups"] });
      toast({ title: "백업 삭제 완료" });
    },
    onError: () => {
      toast({ title: "삭제 실패", variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/backups/${id}/restore`, { confirm: true });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({ title: "복원 완료", description: "데이터가 성공적으로 복원되었습니다." });
      setRestoreId(null);
    },
    onError: () => {
      toast({ title: "복원 실패", description: "데이터 복원에 실패했습니다.", variant: "destructive" });
      setRestoreId(null);
    },
  });

  const handleDownload = (id: string) => {
    const link = document.createElement("a");
    link.href = `/api/backups/${id}/download`;
    link.download = "";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    setTimeout(() => document.body.removeChild(link), 100);
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Database className="w-6 h-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">백업관리</h1>
            <p className="text-sm text-muted-foreground">데이터베이스 백업 및 복원을 관리합니다</p>
          </div>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          className="rounded-none"
          data-testid="button-create-backup"
        >
          <Plus className="w-4 h-4 mr-2" />
          새 백업 생성
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-none" />
          ))}
        </div>
      ) : backups.length === 0 ? (
        <Card className="rounded-none border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Database className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground">저장된 백업이 없습니다</p>
            <p className="text-sm text-muted-foreground mt-1">새 백업을 생성하여 데이터를 안전하게 보관하세요</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {backups.map((backup) => {
            const tableCounts = backup.tableCounts ? JSON.parse(backup.tableCounts) as Record<string, number> : {};
            const totalRows = Object.values(tableCounts).reduce((sum, c) => sum + c, 0);

            return (
              <Card key={backup.id} className="rounded-none border-border" data-testid={`card-backup-${backup.id}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <CardTitle className="text-base font-semibold truncate" data-testid={`text-backup-label-${backup.id}`}>
                      {backup.label || "백업"}
                    </CardTitle>
                    <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDateTime(backup.createdAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        {backup.createdByName}
                      </span>
                      <span className="flex items-center gap-1">
                        <HardDrive className="w-3.5 h-3.5" />
                        {formatFileSize(backup.sizeBytes || 0)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="rounded-none"
                      onClick={() => handleDownload(backup.id)}
                      data-testid={`button-download-${backup.id}`}
                      title="다운로드"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="rounded-none"
                          data-testid={`button-restore-${backup.id}`}
                          title="복원"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-none">
                        <AlertDialogHeader>
                          <AlertDialogTitle>데이터 복원 확인</AlertDialogTitle>
                          <AlertDialogDescription className="space-y-2">
                            <span className="block font-semibold text-destructive">
                              이 작업은 현재 모든 데이터를 삭제하고 백업 시점의 데이터로 교체합니다.
                            </span>
                            <span className="block">
                              백업: {backup.label} ({formatDateTime(backup.createdAt)})
                            </span>
                            <span className="block">이 작업은 되돌릴 수 없습니다. 정말 복원하시겠습니까?</span>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel data-testid="button-cancel-restore">취소</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              setRestoreId(backup.id);
                              restoreMutation.mutate(backup.id);
                            }}
                            className="rounded-none bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            data-testid="button-confirm-restore"
                          >
                            복원 실행
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="rounded-none"
                          data-testid={`button-delete-${backup.id}`}
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-none">
                        <AlertDialogHeader>
                          <AlertDialogTitle>백업 삭제</AlertDialogTitle>
                          <AlertDialogDescription>
                            이 백업을 삭제하시겠습니까? 삭제된 백업은 복구할 수 없습니다.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel data-testid="button-cancel-delete">취소</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(backup.id)}
                            className="rounded-none bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            data-testid="button-confirm-delete"
                          >
                            삭제
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardHeader>
                {Object.keys(tableCounts).length > 0 && (
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(tableCounts).map(([table, count]) => (
                        <span
                          key={table}
                          className="inline-flex items-center px-2 py-0.5 text-xs bg-muted rounded-sm"
                          data-testid={`badge-table-${table}`}
                        >
                          {TABLE_LABELS[table] || table}: {count}
                        </span>
                      ))}
                      <span className="inline-flex items-center px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-sm font-medium">
                        합계: {totalRows}
                      </span>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="rounded-none">
          <DialogHeader>
            <DialogTitle>새 백업 생성</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="backup-label">백업 이름 (선택)</Label>
              <Input
                id="backup-label"
                className="rounded-none"
                placeholder="예: 월간 백업, 업데이트 전 백업"
                value={backupLabel}
                onChange={(e) => setBackupLabel(e.target.value)}
                data-testid="input-backup-label"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              모든 테이블의 데이터가 JSON 형식으로 저장됩니다.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-none" onClick={() => setShowCreateDialog(false)} data-testid="button-cancel-create">
              취소
            </Button>
            <Button
              className="rounded-none"
              onClick={() => createMutation.mutate(backupLabel)}
              disabled={createMutation.isPending}
              data-testid="button-submit-create"
            >
              {createMutation.isPending ? "생성 중..." : "백업 생성"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(restoreMutation.isPending || restoreId) && restoreMutation.isPending && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <Card className="rounded-none border-border p-8 text-center space-y-4">
            <RotateCcw className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-lg font-medium">데이터 복원 중...</p>
            <p className="text-sm text-muted-foreground">잠시만 기다려주세요</p>
          </Card>
        </div>
      )}
    </div>
  );
}
