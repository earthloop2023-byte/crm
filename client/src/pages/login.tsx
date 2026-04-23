import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, User } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!loginId.trim() || !password.trim()) {
      setError("아이디와 비밀번호를 입력해주세요.");
      return;
    }

    setIsLoading(true);
    try {
      await login(loginId, password);
    } catch (err: any) {
      const message = err?.message || "";
      if (message.includes("401")) {
        setError("아이디 또는 비밀번호가 올바르지 않습니다.");
      } else if (message.includes("403")) {
        setError("비활성화된 계정입니다.");
      } else {
        setError("로그인에 실패했습니다. 다시 시도해주세요.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-[400px] rounded-none border-border">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-primary/10 mb-4">
              <Lock className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-login-title">
              CRM 로그인
            </h1>
            <p className="text-sm text-muted-foreground mt-2">계정 정보를 입력하여 로그인하세요</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="loginId" className="text-sm font-medium">
                아이디
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="loginId"
                  type="text"
                  placeholder="아이디를 입력하세요"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  className="pl-10 rounded-none"
                  autoComplete="username"
                  data-testid="input-login-id"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                비밀번호
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="비밀번호를 입력하세요"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 rounded-none"
                  autoComplete="current-password"
                  data-testid="input-password"
                />
              </div>
            </div>

            {error && (
              <div
                className="text-sm text-destructive bg-destructive/10 p-3 border border-destructive/20"
                data-testid="text-login-error"
              >
                {error}
              </div>
            )}

            <Button type="submit" className="w-full rounded-none" disabled={isLoading} data-testid="button-login">
              {isLoading ? "로그인 중..." : "로그인"}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
