import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { financeiroService, type ConfigSetorFinanceiro, type SalvarCategoria, type SalvarRegra } from "./service";
import { conferenciaService, type DecisaoItem } from "./conferencia";
import { aprovacaoService, solicitacoesService, type AbaAprovacao, type Decisao, type TipoSolicitacao } from "./solicitacoes";

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

// ---------- Aprovação (Fase 3) ----------
export function useFilaAprovacao(aba: AbaAprovacao) {
  return useQuery({ queryKey: [...CHAVE, "aprovacoes", aba], queryFn: () => aprovacaoService.fila(aba), refetchInterval: 60_000 });
}

export function useDetalheExtra(id: number) {
  return useQuery({ queryKey: [...CHAVE, "extra", id], queryFn: () => aprovacaoService.extra(id), enabled: id > 0 });
}

export const useDecidir = () => useMuda((p: { id: number; decisao: Decisao; comentario: string | null }) => aprovacaoService.decidir(p));
export const useDefinirSubstituto = () => useMuda((p: { substitutoId: string; de: string; ate: string }) => aprovacaoService.definirSubstituto(p));
export const useRemoverSubstituto = () => useMuda((id: number) => aprovacaoService.removerSubstituto(id));

// ---------- Conferência (Fase 5) ----------
export function useFilaConferencia() {
  return useQuery({ queryKey: [...CHAVE, "conferencia"], queryFn: () => conferenciaService.fila(), refetchInterval: 60_000 });
}

export function useConferencia(id: number) {
  return useQuery({ queryKey: [...CHAVE, "conferencia", id], queryFn: () => conferenciaService.itens(id), enabled: id > 0 });
}

export const useDecidirItem = () => useMuda((p: { itemId: number; decisao: DecisaoItem; valorGlosa: number | null; obs: string | null }) => conferenciaService.decidirItem(p));
export const usePedirAjuste = () => useMuda((p: { id: number; comentario: string }) => conferenciaService.pedirAjuste(p));
export const usePendenciaResponder = () => useMuda((p: { id: number; resposta: string }) => conferenciaService.pendenciaResponder(p));
export const useProgramarPagamento = () => useMuda((p: { id: number; data: string }) => conferenciaService.programarPagamento(p));
export const useMarcarPaga = () => useMuda((id: number) => conferenciaService.marcarPaga(id));
