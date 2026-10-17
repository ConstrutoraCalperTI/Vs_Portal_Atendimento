import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { financeiroService, type ConfigSetorFinanceiro, type SalvarCategoria, type SalvarRegra } from "./service";

const CHAVE = ["financeiro"] as const;

/** Coluna "Aprovação" da lista de Setores e números. */
export function useResumoSetoresFinanceiro() {
  return useQuery({ queryKey: [...CHAVE, "setores"], queryFn: () => financeiroService.resumoSetores(), staleTime: 30_000 });
}

export function useSetorFinanceiro(setorId: number) {
  return useQuery({ queryKey: [...CHAVE, "setor", setorId], queryFn: () => financeiroService.setor(setorId), enabled: setorId > 0 });
}

export function useUsuariosFinanceiro() {
  return useQuery({ queryKey: [...CHAVE, "usuarios"], queryFn: () => financeiroService.usuarios(), staleTime: 60_000 });
}

export function useCadastrosFinanceiros() {
  return useQuery({ queryKey: [...CHAVE, "cadastros"], queryFn: () => financeiroService.cadastros() });
}

function useMuda<T>(fn: (p: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }) });
}

export const useSalvarSetorFinanceiro = () => useMuda((p: ConfigSetorFinanceiro) => financeiroService.salvarSetor(p));
export const useSalvarFundoFixo = () => useMuda((p: { usuarioId: string; valor: number; vigenteDesde?: string }) => financeiroService.salvarFundoFixo(p));
export const useSalvarCategoria = () => useMuda((p: SalvarCategoria) => financeiroService.salvarCategoria(p));
export const useSalvarRegra = () => useMuda((p: SalvarRegra) => financeiroService.salvarRegra(p));
