import type { TipoSolicitacao } from "../solicitacoes";

export const NOME_TIPO: Record<TipoSolicitacao, string> = { reembolso: "Reembolso", fundo_fixo: "Fundo fixo", adiantamento: "Adiantamento" };

/** "2026-10-31" → "31/10/2026" (sem fuso: data pura). */
export function dataBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** "2026-10-01" → "OUTUBRO - 2026" (como no formulário padrão 2026). */
export function mesBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m] = iso.split("-").map(Number);
  return `${new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" }).toUpperCase()} - ${a}`;
}
