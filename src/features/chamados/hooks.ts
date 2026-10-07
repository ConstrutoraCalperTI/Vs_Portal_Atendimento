import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { statusService } from "./status/service";
import type { JustificativaSalvar, StatusSalvar } from "./status/types";
import { visoesService } from "./visoes/service";
import type { VisaoSalvar } from "./visoes/types";

// Gestão de Chamados: status e visões de Tickets.

const STATUS = ["chamados", "status"] as const;
const VISOES = ["chamados", "visoes"] as const;

export function useStatusTickets() {
  return useQuery({ queryKey: STATUS, queryFn: () => statusService.lista(), staleTime: 60_000 });
}

function useMudaStatus<T>(fn: (p: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: STATUS }) });
}

export const useSalvarStatus = () => useMudaStatus((p: StatusSalvar) => statusService.salvarStatus(p));
export const useSalvarJustificativa = () => useMudaStatus((p: JustificativaSalvar) => statusService.salvarJustificativa(p));
export const useOrdenarStatus = () => useMudaStatus((ids: number[]) => statusService.ordenar(ids));

/** Visões que o usuário pode usar na tela Tickets (habilitadas; das equipes dele, ou todas para admin). */
export function useVisoesDisponiveis(userId: string | undefined) {
  return useQuery({ queryKey: [...VISOES, "disponiveis", userId], queryFn: () => visoesService.disponiveis(), enabled: Boolean(userId) });
}

/** Todas as visões, para a tela Configurar visões (só Admin e Super admin). */
export function useVisoesConfig() {
  return useQuery({ queryKey: [...VISOES, "config"], queryFn: () => visoesService.todas() });
}

export function useKanbanPadrao() {
  return useQuery({ queryKey: [...VISOES, "kanban-padrao"], queryFn: () => visoesService.kanbanPadrao() });
}

export function useEquipesVisoes() {
  return useQuery({ queryKey: [...VISOES, "equipes"], queryFn: () => visoesService.equipes(), staleTime: 60_000 });
}

function useMudaVisoes<T>(fn: (p: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: VISOES }) });
}

export const useSalvarVisao = () => useMudaVisoes((p: VisaoSalvar) => visoesService.salvar(p));
export const useExcluirVisao = () => useMudaVisoes((id: number) => visoesService.excluir(id));
export const useSalvarKanbanPadrao = () => useMudaVisoes((p: VisaoSalvar["kanban"]["colunas"]) => visoesService.salvarKanbanPadrao(p));
