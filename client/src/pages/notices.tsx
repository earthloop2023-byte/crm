import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Search, Plus, Eye, Pin, Trash2, Edit, ArrowLeft } from "lucide-react";
import { Pagination } from "@/components/pagination";
import type { Notice } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const ADMIN_ROLES = ["대표이사", "총괄이사", "개발자"];

export default function NoticesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { formatDate, formatDateTime } = useSettings();
  const isAdmin = user && ADMIN_ROLES.includes(user.role || "");

  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [viewMode, setViewMode] = useState<"list" | "detail" | "write">("list");
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);

  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formPinned, setFormPinned] = useState(false);

  const { data: noticesList, isLoading } = useQuery<Notice[]>({
    queryKey: ["/api/notices"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; content: string; isPinned: boolean; authorId: string; authorName: string }) => {
      const res = await apiRequest("POST", "/api/notices", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notices"] });
      toast({ title: "공지사항이 등록되었습니다." });
      resetForm();
      setViewMode("list");
    },
    onError: () => {
      toast({ title: "공지사항 등록에 실패했습니다.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { title: string; content: string; isPinned: boolean } }) => {
      const res = await apiRequest("PUT", `/api/notices/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notices"] });
      toast({ title: "공지사항이 수정되었습니다." });
      resetForm();
      setViewMode("list");
    },
    onError: () => {
      toast({ title: "공지사항 수정에 실패했습니다.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/notices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notices"] });
      toast({ title: "공지사항이 삭제되었습니다." });
      setViewMode("list");
      setSelectedNotice(null);
    },
    onError: () => {
      toast({ title: "공지사항 삭제에 실패했습니다.", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormTitle("");
    setFormContent("");
    setFormPinned(false);
    setEditingNotice(null);
  };

  const handleWrite = () => {
    resetForm();
    setViewMode("write");
  };

  const handleEdit = (notice: Notice) => {
    setEditingNotice(notice);
    setFormTitle(notice.title);
    setFormContent(notice.content);
    setFormPinned(notice.isPinned || false);
    setViewMode("write");
  };

  const handleSubmit = () => {
    if (!formTitle.trim() || !formContent.trim()) {
      toast({ title: "제목과 내용을 입력해주세요.", variant: "destructive" });
      return;
    }
    if (editingNotice) {
      updateMutation.mutate({ id: editingNotice.id, data: { title: formTitle, content: formContent, isPinned: formPinned } });
    } else {
      createMutation.mutate({ title: formTitle, content: formContent, isPinned: formPinned, authorId: user!.id, authorName: user!.name });
    }
  };

  const handleViewDetail = async (notice: Notice) => {
    try {
      const res = await fetch(`/api/notices/${notice.id}`, { credentials: "include" });
      const data = await res.json();
      setSelectedNotice(data);
      setViewMode("detail");
    } catch {
      setSelectedNotice(notice);
      setViewMode("detail");
    }
  };

  const filteredNotices = noticesList?.filter((n) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return n.title.toLowerCase().includes(q) || n.authorName.toLowerCase().includes(q);
  }) || [];

  const totalPages = Math.ceil(filteredNotices.length / itemsPerPage);
  const paginatedNotices = filteredNotices.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-48 rounded-none" />
        <Skeleton className="h-96 w-full rounded-none" />
      </div>
    );
  }

  if (viewMode === "write") {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-none" onClick={() => { resetForm(); setViewMode("list"); }} data-testid="button-back-list">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Bell className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            {editingNotice ? "공지사항 수정" : "공지사항 작성"}
          </h1>
        </div>

        <Card className="rounded-none border-border">
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">제목</label>
              <Input
                placeholder="공지사항 제목을 입력하세요"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="rounded-none"
                data-testid="input-notice-title"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">내용</label>
              <Textarea
                placeholder="공지사항 내용을 입력하세요"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                className="rounded-none min-h-[300px]"
                data-testid="input-notice-content"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="pinned"
                checked={formPinned}
                onCheckedChange={(checked) => setFormPinned(checked === true)}
                data-testid="checkbox-notice-pinned"
              />
              <label htmlFor="pinned" className="text-sm">상단 고정</label>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <Button variant="outline" className="rounded-none" onClick={() => { resetForm(); setViewMode("list"); }} data-testid="button-cancel">
                취소
              </Button>
              <Button
                className="rounded-none"
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-submit-notice"
              >
                {editingNotice ? "수정" : "등록"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (viewMode === "detail" && selectedNotice) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-none" onClick={() => setViewMode("list")} data-testid="button-back-list">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Bell className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">공지사항</h1>
        </div>

        <Card className="rounded-none border-border">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    {selectedNotice.isPinned && (
                      <Badge variant="outline" className="rounded-none text-xs bg-primary/10 text-primary border-primary/30">
                        <Pin className="w-3 h-3 mr-1" />고정
                      </Badge>
                    )}
                    <h2 className="text-xl font-bold" data-testid="text-notice-title">{selectedNotice.title}</h2>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span data-testid="text-notice-author">{selectedNotice.authorName}</span>
                    <span>{formatDateTime(selectedNotice.createdAt)}</span>
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {selectedNotice.viewCount || 0}
                    </span>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="rounded-none" onClick={() => handleEdit(selectedNotice)} data-testid="button-edit-notice">
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="rounded-none text-red-500"
                      onClick={() => {
                        if (confirm("이 공지사항을 삭제하시겠습니까?")) {
                          deleteMutation.mutate(selectedNotice.id);
                        }
                      }}
                      data-testid="button-delete-notice"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
              <hr className="border-border" />
              <div className="whitespace-pre-wrap text-sm leading-relaxed min-h-[200px]" data-testid="text-notice-content">
                {selectedNotice.content}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">공지사항</h1>
          <Badge variant="outline" className="rounded-none">{filteredNotices.length}건</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="제목 또는 작성자 검색..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="pl-9 w-64 rounded-none"
              data-testid="input-search"
            />
          </div>
          {isAdmin && (
            <Button className="gap-2 rounded-none" onClick={handleWrite} data-testid="button-write-notice">
              <Plus className="w-4 h-4" />
              글쓰기
            </Button>
          )}
        </div>
      </div>

      <Card className="rounded-none border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="table-notices">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground w-16">번호</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">제목</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground w-28">작성자</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground w-32">작성일</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground w-20">조회</th>
                </tr>
              </thead>
              <tbody>
                {paginatedNotices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                      공지사항이 없습니다.
                    </td>
                  </tr>
                ) : (
                  paginatedNotices.map((notice, idx) => (
                    <tr
                      key={notice.id}
                      className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => handleViewDetail(notice)}
                      data-testid={`row-notice-${notice.id}`}
                    >
                      <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                        {notice.isPinned ? (
                          <Pin className="w-4 h-4 text-primary mx-auto" />
                        ) : (
                          filteredNotices.length - ((currentPage - 1) * itemsPerPage + idx)
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {notice.isPinned && (
                            <Badge variant="outline" className="rounded-none text-xs bg-primary/10 text-primary border-primary/30 no-default-active-elevate">
                              고정
                            </Badge>
                          )}
                          <span className={`text-sm ${notice.isPinned ? "font-semibold" : ""}`} data-testid={`text-notice-title-${notice.id}`}>
                            {notice.title}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm">{notice.authorName}</td>
                      <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                        {formatDate(notice.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                        <span className="flex items-center justify-center gap-1">
                          <Eye className="w-3 h-3" />
                          {notice.viewCount || 0}
                        </span>
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
          <SelectTrigger className="w-auto min-w-[120px] rounded-none h-9" data-testid="select-page-size">
            <SelectValue placeholder={`${itemsPerPage}개씩 보기`} />
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
