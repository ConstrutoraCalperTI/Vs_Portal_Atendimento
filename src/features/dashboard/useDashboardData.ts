import { useMemo } from "react";
import { useAccess } from "../configuracoes/access/useAccess";
import { dashboardMock } from "./mock";
import type { DashboardPayload, DashboardUser } from "./types";

/** Iniciais do avatar: primeira letra do primeiro e do último nome ("Ana Lima" → "AL"). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * Ponto único de leitura do painel. Hoje devolve o mock com o usuário logado como `current_user`
 * (no "Ver como", o usuário simulado); depois troca pela RPC `rpc_dashboard` (react-query).
 */
export function useDashboardData(): DashboardPayload {
  const { user } = useAccess();
  return useMemo(() => {
    if (!user) return dashboardMock;
    const current: DashboardUser = { id: user.id, name: user.name, initials: initialsOf(user.name) };
    return { ...dashboardMock, current_user: current };
  }, [user]);
}
