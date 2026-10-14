import { edgeFunction } from "../../config/app";
import type { Json } from "../../lib/database.types";
import { supabase } from "../../lib/supabase";
import { DATA_SOURCE } from "../configuracoes/services";
import { currentActor, delay } from "../configuracoes/services/mock/runtime";
import { fromFunction, fromPostgrest } from "../configuracoes/services/supabase/errors";
import { ServiceError } from "../configuracoes/services/types";

// Gestão Tickets Movidesk (docs/PLANO-tickets-movidesk.md, migrations 20261014100000 e …110000). Espelho só leitura da
// base do Movidesk: a tela Tickets (Admin e Super admin) lê pelas RPCs md_*; a integração (Super admin) configura token,
// agenda e anexos, e a Edge portal_atendimento-movidesk testa e sincroniza. Anexos ficam no bucket privado movidesk-anexos.

export const BUCKET_ANEXOS = "movidesk-anexos";

export type StatusBase = "New" | "InAttendance" | "Stopped" | "Resolved" | "Closed" | "Canceled";
export type Etapa = "recentes" | "past" | "incremental";

export interface FiltrosTickets {
  num?: string;
  de?: string;
  ate?: string;
  ano?: number | "";
  servico?: string;
  responsavel?: string;
  statusBase?: string;
  equipe?: string;
  texto?: string;
  pagina?: number;
}

export interface TicketLinha {
  id: number;
  protocolo: string | null;
  assunto: string | null;
  origem: string;
  tipo: number | null;
  categoria: string | null;
  qtdAcoes: number | null;
  servico: string | null;
  responsavel: string | null;
  equipe: string | null;
  criadoEm: string | null;
  status: string | null;
  statusBase: StatusBase | null;
  slaSolucaoEm: string | null;
  slaPausado: boolean;
  resolvidoEm: string | null;
  fechadoEm: string | null;
}

export interface ListaTickets {
  total: number;
  pagina: number;
  porPagina: number;
  tickets: TicketLinha[];
}

export interface Situacao {
  etapa: Etapa;
  ativo: boolean;
  ultimaRodadaEm: string | null;
  cargaConcluidaEm: string | null;
  temToken: boolean;
}

export interface OpcoesFiltro {
  anos: number[];
  servicos: string[];
  responsaveis: string[];
  equipes: string[];
  statusBase: StatusBase[];
  situacao: Situacao;
}

export interface TicketDetalhe extends Omit<TicketLinha, "qtdAcoes" | "fechadoEm"> {
  urgencia: string | null;
  justificativa: string | null;
  criadoPor: string | null;
  resolvidoEm: string | null;
  fechadoEm: string | null;
  reabertoEm: string | null;
  slaRespostaEm: string | null;
  slaRespostaRealEm: string | null;
  atualizadoEm: string | null;
  clientes: { id: string | null; nome: string | null; email: string | null; organizacao: string | null }[];
  camposAdicionais: { campo: number | null; linha: number | null; valor: string | null }[];
  acoes: { id: number; tipo: number | null; texto: string | null; criadoEm: string | null; criadoPor: string | null; status: string | null }[];
  historicoStatus: { status: string | null; justificativa: string | null; em: string | null; por: string | null }[];
  historicoResponsavel: { responsavel: string | null; equipe: string | null; em: string | null; por: string | null }[];
}

export type SituacaoAnexo = "pendente" | "baixando" | "baixado" | "erro" | "grande";

export interface AnexoTicket {
  id: number;
  acaoId: number;
  nome: string;
  situacao: SituacaoAnexo;
  tamanho: number | null;
  tipo: string | null;
  storagePath: string | null;
  erro: string | null;
}

export interface Agenda {
  ativo: boolean;
  janelaInicio: string;
  janelaFim: string;
  /** 0 = domingo. */
  dias: number[];
  recorrenciaMin: number;
  paginasPorRodada: number;
  incrementalDiaTodo: boolean;
  incrementalRecorrenciaMin: number;
  baixarAnexos: boolean;
  anexoMaxMb: number;
}

export interface RotaTestada {
  nome: string;
  rota: string;
  ok: boolean;
  http: number | null;
  ms: number;
  erro?: string;
}

export interface ConfigMovidesk {
  tokenFinal: string | null;
  tokenDefinidoEm: string | null;
  select: string;
  expand: string;
  agenda: Agenda;
  estado: {
    etapa: Etapa;
    cursorPastId: number;
    cursorRecentesId: number;
    incrementalDesde: string | null;
    cargaIniciadaEm: string | null;
    cargaConcluidaEm: string | null;
    maiorIdMovidesk: number | null;
    rodando: boolean;
    ultimaRodadaEm: string | null;
    totalTickets: number;
    mediaMsPagina: number | null;
  };
  anexos: { total: number; baixados: number; pendentes: number; erros: number; grandes: number; bytes: number };
  ultimoTeste: { em: string; rotas: RotaTestada[] } | null;
}

export type SalvarConfig = Agenda & { select: string; expand: string };

export interface Execucao {
  id: number;
  em: string;
  origem: "agenda" | "manual" | "teste";
  etapa: string | null;
  filtro: string | null;
  tickets: number;
  ms: number | null;
  kb: number | null;
  http: number | null;
  ok: boolean;
  erro: string | null;
}

export interface MovideskService {
  lista(f: FiltrosTickets): Promise<ListaTickets>;
  opcoes(): Promise<OpcoesFiltro>;
  detalhe(id: number): Promise<TicketDetalhe>;
  anexos(id: number): Promise<AnexoTicket[]>;
  /** URL assinada (1 min) para baixar um anexo do bucket. */
  urlAnexo(storagePath: string, nome: string): Promise<string>;
  config(): Promise<ConfigMovidesk>;
  salvarConfig(p: SalvarConfig): Promise<void>;
  salvarToken(token: string): Promise<string>;
  testar(): Promise<{ em: string; rotas: RotaTestada[]; maiorId: number | null }>;
  sincronizarAgora(): Promise<{ etapa: Etapa }>;
  execucoes(soErros: boolean): Promise<Execucao[]>;
  recomecar(): Promise<void>;
  anexosTentarDeNovo(): Promise<number>;
}

async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome as never, args as never);
  if (error) throw fromPostgrest(error);
  return data as T;
}

async function funcao<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(edgeFunction("movidesk"), { body: corpo });
  if (error) throw await fromFunction(error);
  return data as T;
}

/** Filtros vazios não vão para a RPC. */
function limpar(f: FiltrosTickets): Record<string, unknown> {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== "" && v !== undefined && v !== null));
}

const supabaseMovidesk: MovideskService = {
  lista: (f) => rpc<ListaTickets>("md_tickets_lista", { p: limpar(f) as Json }),
  opcoes: () => rpc<OpcoesFiltro>("md_filtros_opcoes"),
  detalhe: (id) => rpc<TicketDetalhe>("md_ticket_detalhe", { p_id: id }),
  anexos: (id) => rpc<AnexoTicket[]>("md_ticket_anexos", { p_id: id }),
  async urlAnexo(path, nome) {
    const { data, error } = await supabase.storage.from(BUCKET_ANEXOS).createSignedUrl(path, 60, { download: nome });
    if (error || !data) throw new ServiceError("INTERNAL", "Não foi possível abrir o anexo.");
    return data.signedUrl;
  },
  config: () => rpc<ConfigMovidesk>("md_config_ler"),
  salvarConfig: (p) => rpc<void>("md_config_salvar", { p: p as unknown as Json }),
  salvarToken: (token) => rpc<string>("md_token_salvar", { p_token: token }),
  testar: () => funcao({ acao: "testar" }),
  sincronizarAgora: () => funcao({ acao: "sincronizar_agora" }),
  execucoes: (soErros) => rpc<Execucao[]>("md_execucoes_lista", { p_so_erros: soErros }),
  recomecar: () => rpc<void>("md_recomecar"),
  anexosTentarDeNovo: () => rpc<number>("md_anexos_tentar_de_novo"),
};

// ---------- Modo simulado: os 7 tickets do teste real de 14/10/2026 (mockup aprovado), CPF mascarado ----------
type TicketMock = TicketLinha & { acoes: TicketDetalhe["acoes"] };
const T = (id: number, assunto: string, servico: string, responsavel: string, equipe: string, criadoEm: string, status: string, statusBase: StatusBase,
  slaSolucaoEm: string | null, slaPausado: boolean, resolvidoEm: string | null, qtdAcoes: number): TicketMock => ({
  id, protocolo: null, assunto, origem: "E-mail recebido", tipo: 2, categoria: null, qtdAcoes, servico, responsavel, equipe, criadoEm, status, statusBase,
  slaSolucaoEm, slaPausado, resolvidoEm, fechadoEm: null,
  acoes: [{ id: 1, tipo: 2, texto: `${assunto}\n\nTexto da mensagem recebida por e-mail.`, criadoEm, criadoPor: "Cliente", status: "Novo" }],
});
const MOCK: TicketMock[] = [
  T(188081, "Fwd: SOLICITAÇÃO DE CADASTRO 1-01-205", "Relacionamento com Clientes › OPÇÃO DE COMPRA › 02 - 2º VIA DE CONTRATO", "Monique Santos Silva", "CRC", "2026-10-06T11:36:39Z", "Resolvido", "Resolved", "2026-10-08T18:36:39Z", false, "2026-10-13T13:30:54Z", 2),
  T(188076, "Escritura", "Relacionamento com Clientes › COBRANÇA", "Monique Santos Silva", "CRC", "2026-10-06T09:04:45Z", "Resolvido", "Resolved", "2026-10-13T13:00:00Z", false, "2026-10-14T12:13:23Z", 6),
  T(188069, "[Not Virus Scanned] Fwd: Aviso de Inadimplência - Empreendimento CONDOMINIO ARTE DESIGN Bloco 02 Unidade 000622", "Relacionamento com Clientes › COBRANÇA › 05 - RENEGOCIAÇÃO", "Melissa Melo Alves", "Cobrança", "2026-10-05T22:59:38Z", "Aguardando", "Stopped", null, true, null, 4),
  T(188045, "Re: Cortinande vidro e vedação entre os imóveis. - Disegno 206", "Relacionamento com Clientes", "Daiana Oliveira", "CRC", "2026-10-05T21:41:38Z", "Resolvido", "Resolved", "2026-10-08T18:00:00Z", false, "2026-10-14T12:45:19Z", 9),
  T(188017, "Re: Ticket 186740 atualizado", "Relacionamento com Clientes › COBRANÇA › 05 - RENEGOCIAÇÃO", "João Victor Da Silva Pessoa", "Cobrança", "2026-10-05T20:31:39Z", "Aguardando", "Stopped", null, true, null, 10),
  T(188002, "Boleto vencido", "FINANCEIRO › BOLETO › BOLETO  - 2ª VIA EM ATRASO", "Debora Braga", "CRC", "2026-10-05T19:29:38Z", "Resolvido", "Resolved", null, false, "2026-10-13T13:15:27Z", 4),
  T(187965, "REPASSE CPF •••••••••57", "Relacionamento com Clientes › COBRANÇA › 03 - FINANCIAMENTO/REPASSE/REGISTRO", "Daiana Oliveira", "CRC", "2026-10-05T17:52:39Z", "Resolvido", "Resolved", "2026-10-13T17:52:39Z", false, "2026-10-14T14:37:51Z", 5),
];

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const diaSP = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const unicos = <V,>(v: (V | null)[]) => [...new Set(v.filter((x): x is V => x !== null))];

const mockConfig: ConfigMovidesk = {
  tokenFinal: null,
  tokenDefinidoEm: null,
  select: "id,protocol,type,subject,category,urgency,status,baseStatus,origin,createdDate,ownerTeam,serviceFirstLevel,serviceSecondLevel,serviceThirdLevel,lastUpdate",
  expand: "actions($expand=createdBy,attachments),clients($expand=organization),owner,createdBy,customFieldValues,ownerHistories($expand=owner,changedBy),statusHistories($expand=changedBy)",
  agenda: { ativo: false, janelaInicio: "19:00", janelaFim: "07:00", dias: [0, 1, 2, 3, 4, 5, 6], recorrenciaMin: 1, paginasPorRodada: 1, incrementalDiaTodo: true, incrementalRecorrenciaMin: 10, baixarAnexos: true, anexoMaxMb: 50 },
  estado: { etapa: "recentes", cursorPastId: 0, cursorRecentesId: 0, incrementalDesde: null, cargaIniciadaEm: null, cargaConcluidaEm: null, maiorIdMovidesk: 190_000, rodando: false, ultimaRodadaEm: null, totalTickets: MOCK.length, mediaMsPagina: 55_000 },
  anexos: { total: 0, baixados: 0, pendentes: 0, erros: 0, grandes: 0, bytes: 0 },
  ultimoTeste: null,
};

function exigirSuper() {
  if (currentActor().role !== "super_admin") throw new ServiceError("FORBIDDEN", "Só o Super admin configura a integração com o Movidesk.");
}

const mockMovidesk: MovideskService = {
  async lista(f) {
    await delay();
    const termos = semAcento(f.texto ?? "").split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
    const r = MOCK.filter((t) => (!f.num || String(t.id) === f.num.trim() || t.protocolo === f.num.trim())
      && (!f.de || (t.criadoEm && diaSP(t.criadoEm) >= f.de)) && (!f.ate || (t.criadoEm && diaSP(t.criadoEm) <= f.ate))
      && (!f.ano || (t.criadoEm && diaSP(t.criadoEm).startsWith(String(f.ano))))
      && (!f.servico || t.servico === f.servico) && (!f.responsavel || t.responsavel === f.responsavel)
      && (!f.statusBase || t.statusBase === f.statusBase) && (!f.equipe || t.equipe === f.equipe)
      && termos.every((termo) => semAcento(`${t.assunto} ${t.acoes.map((a) => a.texto).join(" ")}`).includes(termo)));
    return { total: r.length, pagina: f.pagina ?? 1, porPagina: 100, tickets: r.map(({ acoes: _a, ...linha }) => linha) };
  },
  async opcoes() {
    await delay();
    return {
      anos: [2026],
      servicos: unicos(MOCK.map((t) => t.servico)).sort(),
      responsaveis: unicos(MOCK.map((t) => t.responsavel)).sort(),
      equipes: unicos(MOCK.map((t) => t.equipe)).sort(),
      statusBase: unicos(MOCK.map((t) => t.statusBase)).sort(),
      situacao: { etapa: "incremental", ativo: true, ultimaRodadaEm: "2026-10-14T15:05:00Z", cargaConcluidaEm: "2026-10-14T15:00:00Z", temToken: true },
    };
  },
  async detalhe(id) {
    await delay();
    const t = MOCK.find((x) => x.id === id);
    if (!t) throw new ServiceError("NOT_FOUND", "Ticket não encontrado na base do Movidesk.");
    return {
      ...t, urgencia: "Média", justificativa: null, criadoPor: "Cliente", reabertoEm: null, slaRespostaEm: null, slaRespostaRealEm: null,
      atualizadoEm: t.resolvidoEm ?? t.criadoEm, clientes: [{ id: "c1", nome: "Cliente", email: null, organizacao: null }], camposAdicionais: [],
      historicoStatus: [{ status: "Novo", justificativa: null, em: t.criadoEm, por: "Sistema" }, { status: t.status, justificativa: null, em: t.resolvidoEm ?? t.criadoEm, por: t.responsavel }],
      historicoResponsavel: [{ responsavel: t.responsavel, equipe: t.equipe, em: t.criadoEm, por: "Sistema" }],
    };
  },
  async anexos(id) {
    await delay();
    return id === 188081 ? [{ id: 1, acaoId: 1, nome: "contrato.pdf", situacao: "baixado", tamanho: 645_000, tipo: "application/pdf", storagePath: null, erro: null }] : [];
  },
  async urlAnexo() {
    throw new ServiceError("INTEGRATION_NOT_CONFIGURED", "No modo simulado não há arquivos para baixar.");
  },
  async config() {
    await delay();
    exigirSuper();
    return structuredClone(mockConfig);
  },
  async salvarConfig(p) {
    await delay();
    exigirSuper();
    if (!p.dias.length) throw new ServiceError("INVALID_INPUT", "Escolha pelo menos um dia da semana.", "dias");
    if (p.janelaInicio === p.janelaFim) throw new ServiceError("INVALID_INPUT", "O horário inicial e o final precisam ser diferentes.", "janelaFim");
    const { select, expand, ...agenda } = p;
    Object.assign(mockConfig, { select, expand, agenda });
  },
  async salvarToken(token) {
    await delay();
    exigirSuper();
    const guid = token.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
    if (!guid) throw new ServiceError("INVALID_INPUT", "O token do Movidesk é um código de 36 caracteres (ex.: 1a2b3c4d-…). Confira o que foi colado.", "token");
    mockConfig.tokenFinal = guid.slice(-4).toLowerCase();
    mockConfig.tokenDefinidoEm = new Date().toISOString();
    return mockConfig.tokenFinal;
  },
  async testar() {
    await delay();
    exigirSuper();
    const em = new Date().toISOString();
    const rotas: RotaTestada[] = [
      { nome: "Carga histórica", rota: "tickets/past", ok: true, http: 200, ms: 4100 },
      { nome: "Tickets recentes", rota: "tickets", ok: true, http: 200, ms: 2300 },
      { nome: "Incremental", rota: "tickets", ok: true, http: 200, ms: 2600 },
    ];
    mockConfig.ultimoTeste = { em, rotas };
    return { em, rotas, maiorId: 190_000 };
  },
  async sincronizarAgora() {
    await delay();
    exigirSuper();
    return { etapa: mockConfig.estado.etapa };
  },
  async execucoes() {
    await delay();
    return [];
  },
  async recomecar() {
    await delay();
    exigirSuper();
    Object.assign(mockConfig.estado, { etapa: "recentes", cursorPastId: 0, cursorRecentesId: 0 });
  },
  async anexosTentarDeNovo() {
    await delay();
    return 0;
  },
};

export const movideskService: MovideskService = DATA_SOURCE === "mock" ? mockMovidesk : supabaseMovidesk;
