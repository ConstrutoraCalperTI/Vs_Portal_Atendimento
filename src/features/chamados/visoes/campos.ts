import type { CampoAgrupamento, CampoId, ColunaLista, Operador, Ordenacao } from "./types";

// Lista fechada de campos das condições (D3). A RPC ch_visao_salvar valida contra a mesma lista; a tela
// monta o seletor de valores conforme `valores`.

export type FonteValores = "recebido_em" | "origem" | "equipe" | "usuario" | "servico" | "status" | "justificativa" | "prioridade" | "tag" | "texto" | "data" | "dias" | null;

export interface CampoDef {
  id: CampoId;
  label: string;
  operadores: readonly Operador[];
  /** De onde vêm as opções do valor (null = operador sem valor). */
  valores: FonteValores;
}

export const OPERADORES: Record<Operador, { label: string; semValor?: boolean }> = {
  igual: { label: "Igual a" },
  diferente: { label: "Diferente de" },
  contem: { label: "Contém" },
  vazio: { label: "Não informado", semValor: true },
  preenchido: { label: "Informado", semValor: true },
  usuario_logado: { label: "É o usuário logado", semValor: true },
  ultimos_dias: { label: "Nos últimos (dias)" },
  antes: { label: "Antes de" },
  depois: { label: "Depois de" },
  vencido: { label: "Vencido", semValor: true },
  vence_hoje: { label: "Vence hoje", semValor: true },
  no_prazo: { label: "No prazo", semValor: true },
};

export const CAMPOS: readonly CampoDef[] = [
  { id: "recebido_em", label: "Ticket: Recebido em (conta/canal)", operadores: ["igual", "diferente"], valores: "recebido_em" },
  { id: "origem", label: "Ticket: Origem", operadores: ["igual", "diferente"], valores: "origem" },
  { id: "equipe", label: "Ticket: Equipe responsável", operadores: ["igual", "diferente", "vazio"], valores: "equipe" },
  { id: "responsavel", label: "Ticket: Responsável", operadores: ["igual", "diferente", "vazio", "preenchido", "usuario_logado"], valores: "usuario" },
  { id: "solicitante", label: "Ticket: Solicitante", operadores: ["contem", "igual"], valores: "texto" },
  { id: "servico", label: "Ticket: Serviço", operadores: ["igual", "diferente"], valores: "servico" },
  { id: "status", label: "Ticket: Status", operadores: ["igual", "diferente"], valores: "status" },
  { id: "justificativa", label: "Ticket: Justificativa", operadores: ["igual", "diferente", "vazio"], valores: "justificativa" },
  { id: "prioridade", label: "Ticket: Prioridade", operadores: ["igual", "diferente"], valores: "prioridade" },
  { id: "tag", label: "Ticket: TAG", operadores: ["igual", "diferente", "vazio", "preenchido"], valores: "tag" },
  { id: "criado_em", label: "Ticket: Criado em", operadores: ["ultimos_dias", "antes", "depois"], valores: "data" },
  { id: "sla", label: "Ticket: SLA de solução", operadores: ["vencido", "vence_hoje", "no_prazo"], valores: null },
];

export function campoDef(id: CampoId): CampoDef {
  const c = CAMPOS.find((x) => x.id === id);
  if (!c) throw new Error(`Campo de condição desconhecido: ${id}`);
  return c;
}

/** Fonte do valor conforme o operador ("Nos últimos" pede número de dias). */
export function fonteDoValor(campo: CampoId, operador: Operador): FonteValores {
  if (OPERADORES[operador].semValor) return null;
  if (operador === "ultimos_dias") return "dias";
  return campoDef(campo).valores;
}

export const ORDENACOES: Record<Ordenacao, string> = {
  sla: "Vencimento do SLA (vencidos primeiro)",
  criado: "Criado em (mais novo primeiro)",
  prioridade: "Prioridade (urgente primeiro)",
};

export const AGRUPAMENTOS: Record<CampoAgrupamento, string> = {
  equipe: "Equipe responsável",
  responsavel: "Responsável",
  status: "Status",
  servico: "Serviço",
  origem: "Origem",
  prioridade: "Prioridade",
};

export const COLUNAS_LISTA: Record<ColunaLista, string> = {
  solicitante: "Solicitante",
  status: "Status",
  responsavel: "Responsável",
  sla: "SLA de solução",
  origem: "Origem",
  servico: "Serviço",
  equipe: "Equipe",
  prioridade: "Prioridade",
  criado: "Criado em",
};

export const PRIORIDADES = ["Urgente", "Alta", "Normal", "Baixa"] as const;
