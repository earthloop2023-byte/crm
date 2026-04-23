import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import type { PagePermission } from "@shared/schema";
import { allPages, departmentDefaultPages } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

const ADMIN_ROLES = ["대표이사", "총괄이사", "개발자"];

interface PermissionsContextType {
  allowedPages: string[];
  hasPageAccess: (pageKey: string) => boolean;
  hasPathAccess: (path: string) => boolean;
  isLoading: boolean;
  isReady: boolean;
}

const PermissionsContext = createContext<PermissionsContextType | null>(null);

function normalizePageKeys(pageKeys: string[]) {
  return Array.from(
    new Set(
      pageKeys.flatMap((pageKey) => (pageKey === "dashboard" ? ["dashboard", "sales_analytics"] : [pageKey])),
    ),
  );
}

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const isAdmin = user && ADMIN_ROLES.includes(user.role || "");

  const { data: permissions, isLoading, isFetched } = useQuery<PagePermission[]>({
    queryKey: ["/api/permissions", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const res = await fetch(`/api/permissions/${user.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user && !isAdmin,
  });

  const isReady = isAdmin ? true : isFetched;
  const resolvedPermissions = permissions ?? [];
  const explicitPageKeys = normalizePageKeys(resolvedPermissions.map((permission) => permission.pageKey));
  const fallbackPageKeys = normalizePageKeys(
    user?.department ? departmentDefaultPages[user.department] ?? [] : [],
  );

  const allowedPageKeys = isAdmin
    ? normalizePageKeys(allPages.map((page) => page.key))
    : explicitPageKeys.length > 0
      ? explicitPageKeys
      : fallbackPageKeys;

  const hasPageAccess = (pageKey: string): boolean => {
    if (isAdmin) return true;
    if (!isReady) return false;
    return allowedPageKeys.includes(pageKey);
  };

  const hasPathAccess = (path: string): boolean => {
    if (isAdmin) return true;
    if (!isReady) return false;
    const page = allPages.find(p => p.path === path);
    if (!page) return false;
    return hasPageAccess(page.key);
  };

  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="space-y-4 w-64">
          <Skeleton className="h-8 w-full rounded-none" />
          <Skeleton className="h-4 w-3/4 rounded-none" />
          <Skeleton className="h-4 w-1/2 rounded-none" />
        </div>
      </div>
    );
  }

  return (
    <PermissionsContext.Provider value={{ allowedPages: allowedPageKeys, hasPageAccess, hasPathAccess, isLoading, isReady }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error("usePermissions must be used within a PermissionsProvider");
  }
  return context;
}
