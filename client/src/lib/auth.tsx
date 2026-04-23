import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";
import { resetSessionExpiredNotification, suppressSessionExpiredNotification } from "@/lib/session-timeout";
import type { User } from "@shared/schema";

type AuthUser = Omit<User, "password">;

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (loginId: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: Infinity,
    retry: false,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const loginMutation = useMutation({
    mutationFn: async ({ loginId, password }: { loginId: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", { loginId, password });
      return res.json() as Promise<AuthUser>;
    },
    onSuccess: (user) => {
      resetSessionExpiredNotification();
      queryClient.setQueryData(["/api/auth/me"], user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      suppressSessionExpiredNotification();
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "/api/auth/me" });
    },
  });

  const login = async (loginId: string, password: string) => {
    return loginMutation.mutateAsync({ loginId, password });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
