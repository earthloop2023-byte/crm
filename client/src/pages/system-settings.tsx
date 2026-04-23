import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings, Save, Building2, Globe, Clock, Database, Bell, CreditCard } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const defaultSettings: Record<string, string> = {
  company_name: "바이럴매직",
  company_address: "",
  company_phone: "",
  company_email: "",
  company_ceo: "",
  company_business_number: "",
  system_language: "ko",
  system_timezone: "Asia/Seoul",
  system_date_format: "yyyy-MM-dd",
  session_timeout: "30",
  data_backup_cycle: "daily",
  notification_email: "on",
  notification_system: "on",
  max_login_attempts: "5",
  password_min_length: "8",
};

export default function SystemSettingsPage() {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Record<string, string>>({ ...defaultSettings });
  const [hasChanges, setHasChanges] = useState(false);

  const { data: settings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["/api/system-settings"],
  });

  useEffect(() => {
    if (settings) {
      setFormData({ ...defaultSettings, ...settings });
    }
  }, [settings]);

  const updateField = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/system-settings", formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-settings"] });
      setHasChanges(false);
      toast({ title: "시스템 설정이 저장되었습니다." });
    },
    onError: () => {
      toast({ title: "저장에 실패했습니다.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">시스템설정</h1>
        </div>
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="rounded-none border-border p-6">
              <Skeleton className="h-6 w-40 rounded-none mb-4" />
              <div className="space-y-3">
                <Skeleton className="h-10 w-full rounded-none" />
                <Skeleton className="h-10 w-full rounded-none" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">시스템설정</h1>
        </div>
        <Button
          className="rounded-none gap-2"
          onClick={() => saveMutation.mutate()}
          disabled={!hasChanges || saveMutation.isPending}
          data-testid="button-save-settings"
        >
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? "저장 중..." : "저장"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-none border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold" data-testid="text-section-company">회사 정보</h2>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">회사명</label>
              <Input
                className="rounded-none"
                value={formData.company_name}
                onChange={(e) => updateField("company_name", e.target.value)}
                data-testid="input-company-name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">대표자</label>
              <Input
                className="rounded-none"
                value={formData.company_ceo}
                onChange={(e) => updateField("company_ceo", e.target.value)}
                data-testid="input-company-ceo"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">사업자등록번호</label>
              <Input
                className="rounded-none"
                value={formData.company_business_number}
                onChange={(e) => updateField("company_business_number", e.target.value)}
                placeholder="000-00-00000"
                data-testid="input-company-business-number"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">주소</label>
              <Input
                className="rounded-none"
                value={formData.company_address}
                onChange={(e) => updateField("company_address", e.target.value)}
                data-testid="input-company-address"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">대표번호</label>
                <Input
                  className="rounded-none"
                  value={formData.company_main_phone || ""}
                  onChange={(e) => updateField("company_main_phone", e.target.value)}
                  placeholder="대표 전화번호"
                  data-testid="input-company-main-phone"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">이메일</label>
                <Input
                  className="rounded-none"
                  value={formData.company_email}
                  onChange={(e) => updateField("company_email", e.target.value)}
                  data-testid="input-company-email"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">전화번호</label>
                <Input
                  className="rounded-none"
                  value={formData.company_phone}
                  onChange={(e) => updateField("company_phone", e.target.value)}
                  data-testid="input-company-phone"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">팩스</label>
                <Input
                  className="rounded-none"
                  value={formData.company_fax || ""}
                  onChange={(e) => updateField("company_fax", e.target.value)}
                  data-testid="input-company-fax"
                />
              </div>
            </div>
          </div>
        </Card>

        <Card className="rounded-none border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold" data-testid="text-section-general">기본 설정</h2>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">언어</label>
              <Select value={formData.system_language} onValueChange={(v) => updateField("system_language", v)}>
                <SelectTrigger className="rounded-none" data-testid="select-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="ko">한국어</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">타임존</label>
              <Select value={formData.system_timezone} onValueChange={(v) => updateField("system_timezone", v)}>
                <SelectTrigger className="rounded-none" data-testid="select-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="Asia/Seoul">Asia/Seoul (KST, UTC+9)</SelectItem>
                  <SelectItem value="Asia/Tokyo">Asia/Tokyo (JST, UTC+9)</SelectItem>
                  <SelectItem value="America/New_York">America/New_York (EST, UTC-5)</SelectItem>
                  <SelectItem value="Europe/London">Europe/London (GMT, UTC+0)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">날짜 형식</label>
              <Select value={formData.system_date_format} onValueChange={(v) => updateField("system_date_format", v)}>
                <SelectTrigger className="rounded-none" data-testid="select-date-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="yyyy-MM-dd">yyyy-MM-dd (2026-02-06)</SelectItem>
                  <SelectItem value="dd/MM/yyyy">dd/MM/yyyy (06/02/2026)</SelectItem>
                  <SelectItem value="MM/dd/yyyy">MM/dd/yyyy (02/06/2026)</SelectItem>
                  <SelectItem value="yyyy.MM.dd">yyyy.MM.dd (2026.02.06)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="rounded-none border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold" data-testid="text-section-security">보안 설정</h2>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">세션 타임아웃 (분)</label>
              <Select value={formData.session_timeout} onValueChange={(v) => updateField("session_timeout", v)}>
                <SelectTrigger className="rounded-none" data-testid="select-session-timeout">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="15">15분</SelectItem>
                  <SelectItem value="30">30분</SelectItem>
                  <SelectItem value="60">60분</SelectItem>
                  <SelectItem value="120">120분</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">최대 로그인 시도 횟수</label>
              <Select value={formData.max_login_attempts} onValueChange={(v) => updateField("max_login_attempts", v)}>
                <SelectTrigger className="rounded-none" data-testid="select-max-login-attempts">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="3">3회</SelectItem>
                  <SelectItem value="5">5회</SelectItem>
                  <SelectItem value="10">10회</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">최소 비밀번호 길이</label>
              <Select value={formData.password_min_length} onValueChange={(v) => updateField("password_min_length", v)}>
                <SelectTrigger className="rounded-none" data-testid="select-password-min-length">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="6">6자리</SelectItem>
                  <SelectItem value="8">8자리</SelectItem>
                  <SelectItem value="10">10자리</SelectItem>
                  <SelectItem value="12">12자리</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="rounded-none border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold" data-testid="text-section-notification">알림 및 백업</h2>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">이메일 알림</label>
              <Select value={formData.notification_email} onValueChange={(v) => updateField("notification_email", v)}>
                <SelectTrigger className="rounded-none" data-testid="select-notification-email">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="on">사용</SelectItem>
                  <SelectItem value="off">미사용</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">시스템 알림</label>
              <Select value={formData.notification_system} onValueChange={(v) => updateField("notification_system", v)}>
                <SelectTrigger className="rounded-none" data-testid="select-notification-system">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="on">사용</SelectItem>
                  <SelectItem value="off">미사용</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">데이터 백업 주기</label>
              <Select value={formData.data_backup_cycle} onValueChange={(v) => updateField("data_backup_cycle", v)}>
                <SelectTrigger className="rounded-none" data-testid="select-backup-cycle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="daily">매일</SelectItem>
                  <SelectItem value="weekly">매주</SelectItem>
                  <SelectItem value="monthly">매월</SelectItem>
                  <SelectItem value="manual">수동</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>
        <Card className="rounded-none border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold" data-testid="text-section-bank1">계좌정보 1 (하나은행)</h2>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">은행명</label>
              <Input
                className="rounded-none"
                value={formData.bank1_name || ""}
                onChange={(e) => updateField("bank1_name", e.target.value)}
                placeholder="하나은행"
                data-testid="input-bank1-name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">계좌번호</label>
              <Input
                className="rounded-none"
                value={formData.bank1_account || ""}
                onChange={(e) => updateField("bank1_account", e.target.value)}
                placeholder="계좌번호"
                data-testid="input-bank1-account"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">예금주</label>
              <Input
                className="rounded-none"
                value={formData.bank1_holder || ""}
                onChange={(e) => updateField("bank1_holder", e.target.value)}
                placeholder="예금주명"
                data-testid="input-bank1-holder"
              />
            </div>
            <div className="pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-3">공급자 정보</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">상호명</label>
                  <Input
                    className="rounded-none"
                    value={formData.bank1_supplier_name || ""}
                    onChange={(e) => updateField("bank1_supplier_name", e.target.value)}
                    data-testid="input-bank1-supplier-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">사업자번호</label>
                  <Input
                    className="rounded-none"
                    value={formData.bank1_supplier_business_number || ""}
                    onChange={(e) => updateField("bank1_supplier_business_number", e.target.value)}
                    placeholder="000-00-00000"
                    data-testid="input-bank1-supplier-business-number"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">대표</label>
                  <Input
                    className="rounded-none"
                    value={formData.bank1_supplier_ceo || ""}
                    onChange={(e) => updateField("bank1_supplier_ceo", e.target.value)}
                    data-testid="input-bank1-supplier-ceo"
                  />
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="rounded-none border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold" data-testid="text-section-bank2">계좌정보 2 (국민은행)</h2>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">은행명</label>
              <Input
                className="rounded-none"
                value={formData.bank2_name || ""}
                onChange={(e) => updateField("bank2_name", e.target.value)}
                placeholder="국민은행"
                data-testid="input-bank2-name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">계좌번호</label>
              <Input
                className="rounded-none"
                value={formData.bank2_account || ""}
                onChange={(e) => updateField("bank2_account", e.target.value)}
                placeholder="계좌번호"
                data-testid="input-bank2-account"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">예금주</label>
              <Input
                className="rounded-none"
                value={formData.bank2_holder || ""}
                onChange={(e) => updateField("bank2_holder", e.target.value)}
                placeholder="예금주명"
                data-testid="input-bank2-holder"
              />
            </div>
            <div className="pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-3">공급자 정보</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">상호명</label>
                  <Input
                    className="rounded-none"
                    value={formData.bank2_supplier_name || ""}
                    onChange={(e) => updateField("bank2_supplier_name", e.target.value)}
                    data-testid="input-bank2-supplier-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">사업자번호</label>
                  <Input
                    className="rounded-none"
                    value={formData.bank2_supplier_business_number || ""}
                    onChange={(e) => updateField("bank2_supplier_business_number", e.target.value)}
                    placeholder="000-00-00000"
                    data-testid="input-bank2-supplier-business-number"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">대표</label>
                  <Input
                    className="rounded-none"
                    value={formData.bank2_supplier_ceo || ""}
                    onChange={(e) => updateField("bank2_supplier_ceo", e.target.value)}
                    data-testid="input-bank2-supplier-ceo"
                  />
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
