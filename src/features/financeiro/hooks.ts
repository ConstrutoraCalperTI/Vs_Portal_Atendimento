import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { financeiroService, type ConfigSetorFinanceiro, type SalvarCategoria, type SalvarRegra } from "./service";
import { solicitacoesService, type TipoSolicitacao } from "./solicitacoes";

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

function useMuda<T, R>(fn: (p: T) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }) });
}

export const useSalvarSetorFinanceiro = () => useMuda((p: ConfigSetorFinanceiro) => financeiroService.salvarSetor(p));
export const useSalvarFundoFixo = () => useMuda((p: { usuarioId: string; valor: number; vigenteDesde?: string }) => financeiroService.salvarFundoFixo(p));
export const useSalvarCategoria = () => useMuda((p: SalvarCategoria) => financeiroService.salvarCategoria(p));
export const useSalvarRegra = () => useMuda((p: SalvarRegra) => financeiroService.salvarRegra(p));

// ---------- Solicitações (Fase 2) ----------
export function useMinhasSolicitacoes() {
  return useQuery({ queryKey: [...CHAVE, "minhas"], queryFn: () => solicitacoesService.minhas() });
}

export function useSolicitacao(id: number) {
  return useQuery({ queryKey: [...CHAVE, "solicitacao", id], queryFn: () => solicitacoesService.detalhe(id), enabled: id > 0 });
}

export function useChecagens(id: number, ativo: boolean) {
  return useQuery({ queryKey: [...CHAVE, "checagens", id], queryFn: () => solicitacoesService.checagens(id), enabled: id > 0 && ativo });
}

export const useCriarSolicitacao = () => useMuda((tipo: TipoSolicitacao) => solicitacoesService.criar(tipo));
export const useEnviarSolicitacao = () => useMuda((id: number) => solicitacoesService.enviar(id));
export const useCancelarSolicitacao = () => useMuda((id: number) => solicitacoesService.cancelar(id));
