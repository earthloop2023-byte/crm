import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { notifySessionExpired } from "@/lib/session-timeout";

function shouldNotifySessionExpired(url: string) {
  const normalizedUrl = String(url || "").toLowerCase();
  if (!normalizedUrl.includes("/api/")) return false;
  if (normalizedUrl.includes("/api/auth/login")) return false;
  if (normalizedUrl.includes("/api/auth/logout")) return false;
  return true;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 401 && shouldNotifySessionExpired(res.url)) {
      notifySessionExpired();
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
