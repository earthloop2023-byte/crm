import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomCalendar } from "@/components/custom-calendar";
import { Activity, Calendar as CalendarIcon, Clock, Download, Filter, Search, User } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import type { SystemLog } from "@shared/schema";
import { getKoreanDaysAgo, getKoreanEndOfDay, isWithinKoreanDateRange } from "@/lib/korean-time";
import { useSettings } from "@/lib/settings";

const actionTypeLabels: Record<string, string> = {
  login: "로그인",
  logout: "로그아웃",
  register: "회원가입",
  profile_update: "개인정보 수정",
  password_change: "비밀번호 변경",
  government_update: "정부 수정",
  data_export: "데이터 내보내기",
  settings_change: "설정 변경",
  contract_update: "계약 수정",
  excel_upload: "엑셀 업로드",
  data_backup: "데이터 백업",
};

const actionTypeBadgeColors: Record<string, string> = {
  login: "bg-green-500/20 text-green-400 border-green-500/30",
  logout: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  register: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  profile_update: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  password_change: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  government_update: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  data_export: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  settings_change: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  contract_update: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  excel_upload: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  data_backup: "bg-violet-500/20 text-violet-400 border-violet-500/30",
};

function countHangul(value: string) {
  return (value.match(/[가-힣]/g) || []).length;
}

function countReplacement(value: string) {
  return (value.match(/�/g) || []).length;
}

function repairBrokenText(value: string | null | undefined) {
  const text = String(value ?? "");
  if (!text) return "";

  try {
    const bytes = Uint8Array.from(Array.from(text).map((char) => char.charCodeAt(0) & 0xff));
    const repaired = new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
    const originalScore = countHangul(text) - countReplacement(text);
    const repairedScore = countHangul(repaired) - countReplacement(repaired);
    if (repaired && repairedScore > originalScore) {
      return repaired;
    }
  } catch {}

  return text;
}

export default function SystemLogsPage() {
  const { formatDateTime } = useSettings();
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [actionTypeFilter, setActionTypeFilter] = useState<string>("all");
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [startDate, setStartDate] = useState(() => getKoreanDaysAgo(30));
  const [endDate, setEndDate] = useState(() => getKoreanEndOfDay());

  const { data: logs, isLoading } = useQuery<SystemLog[]>({
    queryKey: ["/api/system-logs"],
  });

  const filteredLogs =
    logs?.filter((log) => {
      const loginId = repairBrokenText(log.loginId).toLowerCase();
      const userName = repairBrokenText(log.userName).toLowerCase();
      const action = repairBrokenText(log.action).toLowerCase();
      const query = searchQuery.toLowerCase();

      const matchesSearch =
        searchQuery === "" ||
        loginId.includes(query) ||
        userName.includes(query) ||
        action.includes(query);

      const matchesActionType = actionTypeFilter === "all" || log.actionType === actionTypeFilter;
      const matchesDateRange = isWithinKoreanDateRange(log.createdAt, startDate, endDate);

      return matchesSearch && matchesActionType && matchesDateRange;
    }) || [];

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / itemsPerPage));
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleExcelDownload = () => {
    console.log("Excel download");
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-48 rounded-none" />
        <Skeleton className="h-96 w-full rounded-none" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            시스템 로그
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="계정 또는 사용자명 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-64 rounded-none"
              data-testid="input-search"
            />
          </div>
          <Button variant="outline" className="gap-2 rounded-none" onClick={handleExcelDownload} data-testid="button-excel-download">
            <Download className="w-4 h-4" />
            엑셀다운
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 p-3 bg-card border border-border rounded-none">
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
        <Select value={actionTypeFilter} onValueChange={setActionTypeFilter}>
          <SelectTrigger className="w-40 rounded-none" data-testid="filter-action-type">
            <SelectValue placeholder="활동 유형" />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="all">전체 유형</SelectItem>
            <SelectItem value="login">로그인</SelectItem>
            <SelectItem value="logout">로그아웃</SelectItem>
            <SelectItem value="register">회원가입</SelectItem>
            <SelectItem value="profile_update">개인정보 수정</SelectItem>
            <SelectItem value="password_change">비밀번호 변경</SelectItem>
            <SelectItem value="government_update">정부 수정</SelectItem>
            <SelectItem value="data_export">데이터 내보내기</SelectItem>
            <SelectItem value="settings_change">설정 변경</SelectItem>
            <SelectItem value="contract_update">계약 수정</SelectItem>
            <SelectItem value="excel_upload">엑셀 업로드</SelectItem>
            <SelectItem value="data_backup">데이터 백업</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="rounded-none border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="table-system-logs">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">일시</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">계정</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">사용자명</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">활동유형</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">활동내용</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">IP 주소</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      시스템 로그가 없습니다.
                    </td>
                  </tr>
                ) : (
                  paginatedLogs.map((log) => (
                    <tr key={log.id} className="border-b border-border hover:bg-muted/30 transition-colors" data-testid={`row-log-${log.id}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{formatDateTime(log.createdAt)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium">{repairBrokenText(log.loginId)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-primary/20 flex items-center justify-center">
                            <User className="w-4 h-4 text-primary" />
                          </div>
                          <span className="text-sm">{repairBrokenText(log.userName)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`rounded-none text-xs ${actionTypeBadgeColors[log.actionType] || "bg-gray-500/20 text-gray-400"}`}
                        >
                          {actionTypeLabels[log.actionType] || repairBrokenText(log.actionType)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-muted-foreground">{repairBrokenText(log.action)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-muted-foreground font-mono">{log.ipAddress || "-"}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Select
          value={itemsPerPage.toString()}
          onValueChange={(value) => {
            setItemsPerPage(Number(value));
            setCurrentPage(1);
          }}
        >
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
