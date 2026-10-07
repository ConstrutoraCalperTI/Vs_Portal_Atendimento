// Visões da tela Tickets (docs/PLANO-tickets-visoes.md). Mesmo formato do jsonb gravado em ch_visoes.

export type TipoVisao = "lista" | "kanban";

/** Campos que as condições aceitam (lista fechada; a RPC valida contra a mesma lista). */
export type CampoId =
  | "recebido_em"
  | "origem"
  | "equipe"
  | "responsavel"
  | "solicitante"
  | "servico"
  | "status"
  | "justificativa"
  | "prioridade"
  | "tag"
  | "criado_em"
  | "sla";

export type Operador =
  | "igual"
  | "diferente"
  | "contem"
  | "vazio"
  | "preenchido"
  | "usuario_logado"
  | "ultimos_dias"
  | "antes"
  | "depois"
  | "vencido"
  | "vence_hoje"
  | "no_prazo";

export interface Condicao {
  campo: CampoId;
  operador: Operador;
  /** Vazio nos operadores sem valor (vazio, usuário logado, vencido…). "igual"/"diferente" aceitam vários (OU). */
  valores: string[];
}

/** TODAS = condições combinadas (E); QUALQUER = independentes (ao menos uma). */
export interface Condicoes {
  todas: Condicao[];
  qualquer: Condicao[];
}

export interface StatusRef {
  statusId: number;
  /** null = o status com qualquer justificativa (ou sem nenhuma). */
  justificativaId: number | null;
}

export interface ColunaKanban {
  id: string;
  nome: string;
  status: StatusRef[];
}

export type Ordenacao = "sla" | "criado" | "prioridade";

export interface ConfigKanban {
  colunas: ColunaKanban[];
  ordenar: Ordenacao;
  /** O que acontece ao arrastar um cartão para outra coluna (D5). */
  arrastar: "mudar_status" | "bloqueado";
}

export type CampoAgrupamento = "equipe" | "responsavel" | "status" | "servico" | "origem" | "prioridade";
export type ColunaLista = "solicitante" | "status" | "responsavel" | "sla" | "origem" | "servico" | "equipe" | "prioridade" | "criado";

export interface ConfigAgrupamento {
  por: CampoAgrupamento | null;
  ordemGrupos: "az" | "quantidade";
  ordenar: Ordenacao;
  porPagina: 25 | 50 | 100;
  colunas: ColunaLista[];
}

export interface Visao {
  id: number;
  nome: string;
  habilitada: boolean;
  tipo: TipoVisao;
  /** Abre primeiro na tela Tickets (uma só no sistema). */
  padrao: boolean;
  /** Equipes que veem a visão (D4). Vazio = só Admin e Super admin. */
  equipes: number[];
  condicoes: Condicoes;
  kanban: ConfigKanban;
  agrupamento: ConfigAgrupamento;
  atualizadoEm: string;
  atualizadoPor: string | null;
}

export type VisaoSalvar = Omit<Visao, "id" | "atualizadoEm" | "atualizadoPor"> & { id?: number };

export interface EquipeVisao {
  id: number;
  nome: string;
}
