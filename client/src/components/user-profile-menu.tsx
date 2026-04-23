import { useState } from "react";
import { User, Settings, BookOpen, LogOut, Eye, EyeOff } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function UserProfileMenu() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const pwMinLength = parseInt(settings.password_min_length) || 8;
  const [profileOpen, setProfileOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleLogout = async () => {
    await logout();
  };

  const openProfileDialog = () => {
    setPhone(user?.phone || "");
    setEmail(user?.email || "");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPopoverOpen(false);
    setProfileOpen(true);
  };

  const profileMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const res = await apiRequest("PUT", "/api/auth/profile", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "개인정보가 변경되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setProfileOpen(false);
    },
    onError: (error: any) => {
      toast({ title: error.message || "변경에 실패했습니다.", variant: "destructive" });
    },
  });

  const handleSaveProfile = () => {
    const data: Record<string, string> = {};

    if (phone !== (user?.phone || "")) data.phone = phone;
    if (email !== (user?.email || "")) data.email = email;

    if (newPassword) {
      if (!currentPassword) {
        toast({ title: "현재 비밀번호를 입력해주세요.", variant: "destructive" });
        return;
      }
      if (newPassword !== confirmPassword) {
        toast({ title: "새 비밀번호가 일치하지 않습니다.", variant: "destructive" });
        return;
      }
      if (newPassword.length < pwMinLength) {
        toast({ title: `비밀번호는 최소 ${pwMinLength}자 이상이어야 합니다.`, variant: "destructive" });
        return;
      }
      if (!/[A-Za-z]/.test(newPassword)) {
        toast({ title: "비밀번호에 영문자가 포함되어야 합니다.", variant: "destructive" });
        return;
      }
      if (!/[0-9]/.test(newPassword)) {
        toast({ title: "비밀번호에 숫자가 포함되어야 합니다.", variant: "destructive" });
        return;
      }
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
        toast({ title: "비밀번호에 특수문자가 포함되어야 합니다.", variant: "destructive" });
        return;
      }
      data.currentPassword = currentPassword;
      data.newPassword = newPassword;
    }

    if (Object.keys(data).length === 0) {
      toast({ title: "변경된 정보가 없습니다.", variant: "destructive" });
      return;
    }

    profileMutation.mutate(data);
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-none w-9 h-9 border border-border bg-muted/30"
            data-testid="button-user-profile"
          >
            <User className="w-5 h-5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0 rounded-none" align="end">
          <div className="p-4 border-b border-border">
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-foreground" data-testid="text-user-name">{user?.name || "사용자"}</span>
              <span className="text-xs text-muted-foreground" data-testid="text-user-role">{user?.role || ""} · {user?.department || ""}</span>
              <span className="text-xs text-muted-foreground">{user?.loginId || ""}</span>
            </div>
          </div>
          <div className="py-2">
            <button
              className="flex items-center gap-3 w-full px-4 py-3 text-sm text-foreground hover:bg-muted/50 transition-colors"
              data-testid="button-change-profile"
              onClick={openProfileDialog}
            >
              <Settings className="w-4 h-4 text-muted-foreground" />
              개인정보변경
            </button>
            <button
              className="flex items-center gap-3 w-full px-4 py-3 text-sm text-foreground hover:bg-muted/50 transition-colors"
              data-testid="button-onboarding"
              onClick={() => {
                const link = document.createElement("a");
                link.href = "/onboarding.pdf";
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                document.body.appendChild(link);
                link.click();
                setTimeout(() => document.body.removeChild(link), 100);
              }}
            >
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              온보딩자료
            </button>
            <button
              className="flex items-center gap-3 w-full px-4 py-3 text-sm text-destructive hover:bg-muted/50 transition-colors"
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
              로그아웃
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-[440px] rounded-none">
          <DialogHeader>
            <DialogTitle>개인정보변경</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-5 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-muted-foreground text-xs">아이디</Label>
              <Input
                value={user?.loginId || ""}
                disabled
                className="rounded-none bg-muted/30"
                data-testid="input-profile-loginid"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-muted-foreground text-xs">이름</Label>
              <Input
                value={user?.name || ""}
                disabled
                className="rounded-none bg-muted/30"
                data-testid="input-profile-name"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-muted-foreground text-xs">전화번호</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-0000-0000"
                className="rounded-none"
                data-testid="input-profile-phone"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-muted-foreground text-xs">이메일</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="rounded-none"
                data-testid="input-profile-email"
              />
            </div>

            <div className="border-t border-border pt-4">
              <Label className="text-sm font-medium">비밀번호 변경</Label>
              <p className="text-xs text-muted-foreground mb-3">변경하지 않으려면 비워두세요.</p>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-muted-foreground text-xs">현재 비밀번호</Label>
                  <div className="relative">
                    <Input
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="현재 비밀번호"
                      className="rounded-none pr-10"
                      data-testid="input-profile-current-password"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      tabIndex={-1}
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-muted-foreground text-xs">새 비밀번호</Label>
                  <div className="relative">
                    <Input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="새 비밀번호"
                      className="rounded-none pr-10"
                      data-testid="input-profile-new-password"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      tabIndex={-1}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-muted-foreground text-xs">새 비밀번호 확인</Label>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="새 비밀번호 확인"
                      className="rounded-none pr-10"
                      data-testid="input-profile-confirm-password"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                className="rounded-none"
                onClick={() => setProfileOpen(false)}
                data-testid="button-profile-cancel"
              >
                취소
              </Button>
              <Button
                className="rounded-none"
                onClick={handleSaveProfile}
                disabled={profileMutation.isPending}
                data-testid="button-profile-save"
              >
                {profileMutation.isPending ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
