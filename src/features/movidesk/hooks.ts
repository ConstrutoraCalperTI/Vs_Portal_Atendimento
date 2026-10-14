import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { movideskService, type FiltrosTickets, type SalvarConfig } from "./service";

const CHAVE = ["movidesk"] as const;

export function useTicketsMovidesk(f: FiltrosTickets) {
  return useQuery({ queryKey: [...CHAVE, "lista", f], queryFn: () => movideskService.lista(f), placeholderData: keepPreviousData, staleTime: 30_000 });
}

export function useOpcoesMovidesk() {
  return useQuery({ queryKey: [...CHAVE, "opcoes"], queryFn: () => movideskService.opcoes(), staleTime: 5 * 60_000 });
}

export function useTicketMovidesk(id: number | null) {
  return useQuery({ queryKey: [...CHAVE, "ticket", id], queryFn: () => movideskService.detalhe(id!), enabled: id !== null });
}

export function useAnexosMovidesk(id: number | null) {
  return useQuery({ queryKey: [...CHAVE, "anexos", id], queryFn: () => movideskService.anexos(id!), enabled: id !== null });
}

/** Configuração da integração; atualiza sozinha a cada 15 s enquanto uma rodada estiver em andamento. */
export function useConfigMovidesk() {
  return useQuery({
    queryKey: [...CHAVE, "config"],
    queryFn: () => movideskService.config(),
    refetchInterval: (q) => (q.state.data?.estado.rodando ? 15_000 : 60_000),
  });
}

export function useExecucoesMovidesk(soErros: boolean) {
  return useQuery({ queryKey: [...CHAVE, "execucoes", soErros], queryFn: () => movideskService.execucoes(soErros), refetchInterval: 60_000 });
}

function useMuda<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }) });
}

export const useSalvarConfigMovidesk = () => useMuda((p: SalvarConfig) => movideskService.salvarConfig(p));
export const useSalvarTokenMovidesk = () => useMuda((token: string) => movideskService.salvarToken(token));
export const useTestarMovidesk = () => useMuda(() => movideskService.testar());
export const useSincronizarMovidesk = () => useMuda(() => movideskService.sincronizarAgora());
export const useRecomecarMovidesk = () => useMuda(() => movideskService.recomecar());
export const useAnexosDeNovoMovidesk = () => useMuda(() => movideskService.anexosTentarDeNovo());
