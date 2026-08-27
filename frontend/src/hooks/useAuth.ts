import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { Me } from "@/lib/types";

export function useAuth() {
  const q = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => apiGet<Me>("/auth/me"),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  return {
    user: q.data ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
    role: q.data?.role,
    isAdmin: q.data?.role === "SUPER_ADMIN",
    isManager: q.data?.role === "SALES_MANAGER",
    isSales: q.data?.role === "SALES",
  };
}
