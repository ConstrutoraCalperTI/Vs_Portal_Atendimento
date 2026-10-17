import type { Json } from "../../lib/database.types";
import { supabase } from "../../lib/supabase";
import { DATA_SOURCE } from "../configuracoes/services";
import { currentActor, delay } from "../configuracoes/services/mock/runtime";
import { fromPostgrest } from "../configuracoes/services/supabase/errors";
import { ServiceError } from "../configuracoes/services/types";
import type { StatusSolicitacao } from "./components/StatusChip";

// Solicitações Financeiras, Fase 2 (migration 20261017110000): rascunho, linhas, anexos com SHA-256 no bucket
// sf-comprovantes (<usuário>/<solicitação>/<arquivo>), checagens antes de enviar, envio e cancelamento.

export type TipoSolicitacao = "reembolso" | "fundo_fixo" | "adiantamento";
export const BUCKET = "sf-comprovantes";
export const TAMANHO_MAXIMO = 10 * 1024 * 1024;
export const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp", "application/pdf"];

export interface LinhaLista {
  id: number;
  numero: string;
  tipo: TipoSolicitacao;
  status: StatusSolicitacao;
  competencia: string | null;
  vencimento: string | null;
  valor: number;
  pagarAte: string | null;
  atualizadoEm: string;
  etapa: { papel: string; nivel: number; de: number } | null;
}

export interface Minhas {
  kpis: { rascunho: number; emAprovacao: number; devolvida: number; noFinanceiro: number; aComprovar: number; pagasMes: number; pagasMesValor: number };
  temFundoFixo: boolean;
  temSetor: boolean;
  lista: LinhaLista[];
}

export interface Anexo {
  id: number;
  nome: string;
  path: string;
  mime: string;
  tamanho: number;
}

export interface Item {
  id: number;
  ordem: number;
  data: string | null;
  valor: number | null;
  descricao: string | null;
  motivo: string | null;
  categoriaId: number | null;
  origem: "manual" | "ocr_confirmado" | "ocr_editado";
  statusConferencia: "pendente" | "aceito" | "ajuste" | "glosado";
  anexos: Anexo[];
}

export interface EtapaPrevista {
  nivel: number;
  papel: string;
  exigido: boolean;
  pulado: boolean;
  motivo: string;
  aprovador: string | null;
  substituto: string | null;
}

export interface Aprovacao {
  ciclo: number;
  nivel: number;
  papel: string;
  status: "pendente" | "aguardando" | "aprovado" | "devolvido" | "reprovado" | "pulado" | "nao_exigido";
  comentario: string | null;
  aprovador: string | null;
  substituto: string | null;
  prazoEm: string | null;
  decididoEm: string | null;
}

export interface Evento {
  tipo: string;
  em: string;
  ator: string | null;
  payload: Record<string, unknown>;
}

export interface Detalhe {
  id: number;
  numero: string;
  tipo: TipoSolicitacao;
  status: StatusSolicitacao;
  ciclo: number;
  podeEditar: boolean;
  podeCancelar: boolean;
  solicitante: { id: string; nome: string; cpfMascarado: string | null };
  setor: { id: number; nome: string } | null;
  competencia: string | null;
  periodoDe: string | null;
  periodoAte: string | null;
  centroCusto: string | null;
  valorFundoFixo: number | null;
  saldoInicial: number | null;
  totalDespesas: number;
  saldoFinal: number | null;
  valorGlosado: number;
  valorAPagar: number | null;
  pagarAte: string | null;
  enviadoEm: string | null;
  aceiteEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
  itens: Item[];
  aprovacoes: Aprovacao[];
  eventos: Evento[];
  cadeiaPrevista: EtapaPrevista[] | null;
  categorias: { id: number; nome: string }[];
}

export interface Checagem {
  codigo: string;
  itemId: number | null;
  resultado: "ok" | "alerta" | "bloqueio";
  detalhe: string;
}

export interface LinhaEdicao {
  /** Chave da tela (id gravado ou provisória "n1", "n2"…). */
  chave: string;
  id?: number;
  data: string | null;
  valor: number | null;
  descricao: string | null;
  motivo: string | null;
  categoriaId: number | null;
}

export interface SalvarRascunho {
  id: number;
  competencia: string | null;
  periodoDe: string | null;
  periodoAte: string | null;
  centroCusto: string | null;
  itens: LinhaEdicao[];
}

export interface SolicitacoesService {
  minhas(): Promise<Minhas>;
  criar(tipo: TipoSolicitacao): Promise<number>;
  detalhe(id: number): Promise<Detalhe>;
  salvar(p: SalvarRascunho): Promise<{ itens: { chave: string; id: number }[] }>;
  anexar(p: { solicitacaoId: number; solicitanteId: string; itemId: number; arquivo: File }): Promise<{ id: number; duplicadoEm: string | null }>;
  removerAnexo(id: number): Promise<void>;
  urlAnexo(path: string): Promise<string>;
  checagens(id: number): Promise<Checagem[]>;
  enviar(id: number): Promise<{ status: string; alertas: number }>;
  cancelar(id: number): Promise<void>;
}

/** SHA-256 do arquivo (R06: o mesmo comprovante não pode ser usado duas vezes). */
export async function sha256(arquivo: Blob): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", await arquivo.arrayBuffer());
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function validarArquivo(arquivo: File): ServiceError | null {
  if (!TIPOS_ACEITOS.includes(arquivo.type)) return new ServiceError("INVALID_INPUT", "Envie JPG, PNG, HEIC ou PDF.");
  if (arquivo.size > TAMANHO_MAXIMO) return new ServiceError("INVALID_INPUT", "O arquivo precisa ter até 10 MB.");
  return null;
}

async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome as never, args as never);
  if (error) throw fromPostgrest(error);
  return data as T;
}

const num = (v: unknown) => (v == null ? null : Number(v));

function normalizar(d: Detalhe): Detalhe {
  return {
    ...d,
    valorFundoFixo: num(d.valorFundoFixo), saldoInicial: num(d.saldoInicial), totalDespesas: Number(d.totalDespesas), saldoFinal: num(d.saldoFinal),
    valorGlosado: Number(d.valorGlosado), valorAPagar: num(d.valorAPagar),
    itens: d.itens.map((i) => ({ ...i, valor: num(i.valor) })),
  };
}

const supabaseSolicitacoes: SolicitacoesService = {
  minhas: async () => {
    const m = await rpc<Minhas>("sf_minhas");
    return { ...m, kpis: { ...m.kpis, pagasMesValor: Number(m.kpis.pagasMesValor) }, lista: m.lista.map((l) => ({ ...l, valor: Number(l.valor) })) };
  },
  criar: (tipo) => rpc<number>("sf_rascunho_criar", { p_tipo: tipo }).then(Number),
  detalhe: async (id) => normalizar(await rpc<Detalhe>("sf_detalhe", { p_id: id })),
  salvar: (p) => rpc("sf_rascunho_salvar", { p: p as unknown as Json }),
  async anexar({ solicitacaoId, solicitanteId, itemId, arquivo }) {
    const invalido = validarArquivo(arquivo);
    if (invalido) throw invalido;
    const hash = await sha256(arquivo);
    const ext = (arquivo.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    const path = `${solicitanteId}/${solicitacaoId}/${hash.slice(0, 16)}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, arquivo, { contentType: arquivo.type, upsert: false });
    if (error) throw new ServiceError("INVALID_INPUT", "Não foi possível enviar o arquivo. Tente de novo.");
    try {
      return await rpc("sf_anexo_registrar", {
        p: { solicitacaoId, itemId, path, nome: arquivo.name, mime: arquivo.type, tamanho: arquivo.size, sha256: hash } as unknown as Json,
      });
    } catch (e) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw e;
    }
  },
  async removerAnexo(id) {
    const path = await rpc<string>("sf_anexo_remover", { p_id: id });
    await supabase.storage.from(BUCKET).remove([path]);
  },
  async urlAnexo(path) {
    // URL assinada de 5 minutos (CONTEXTO.md, seção 6).
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error || !data) throw new ServiceError("NOT_FOUND", "Não foi possível abrir o arquivo.");
    return data.signedUrl;
  },
  checagens: (id) => rpc<Checagem[]>("sf_checagens", { p_id: id }),
  enviar: (id) => rpc("sf_enviar", { p_id: id, p_aceite: true }),
  cancelar: (id) => rpc<void>("sf_cancelar", { p_id: id }),
};

// ---------- Modo simulado ----------
const registros = new Map<number, Detalhe>();
const arquivos = new Map<string, Blob>();
let proximo = 1;
let proximoItem = 1;

function exigirEditavel(id: number): Detalhe {
  const d = registros.get(id);
  if (!d) throw new ServiceError("NOT_FOUND", "Solicitação não encontrada.");
  if (!["rascunho", "devolvida"].includes(d.status)) throw new ServiceError("INVALID_INPUT", "Esta solicitação não pode mais ser alterada.");
  return d;
}

function recalcular(d: Detalhe) {
  d.totalDespesas = d.itens.reduce((s, i) => s + (i.valor ?? 0), 0);
  d.valorAPagar = d.totalDespesas - d.valorGlosado;
  if (d.tipo === "fundo_fixo") d.saldoFinal = (d.saldoInicial ?? 0) - d.totalDespesas;
  d.atualizadoEm = new Date().toISOString();
  d.cadeiaPrevista = [
    { nivel: 1, papel: "Gestor", exigido: true, pulado: false, motivo: "sempre", aprovador: "Marina Costa", substituto: "Ana Prado" },
  ];
}

function checar(d: Detalhe): Checagem[] {
  const r: Checagem[] = d.itens
    .filter((i) => i.anexos.length === 0)
    .map((i) => ({ codigo: "R01", itemId: i.id, resultado: "bloqueio", detalhe: `Linha ${i.ordem} sem comprovante` }));
  if (d.tipo === "fundo_fixo" && d.totalDespesas > (d.saldoInicial ?? 0)) {
    r.push({ codigo: "R10", itemId: null, resultado: "bloqueio", detalhe: "Despesas acima do saldo inicial do fundo fixo" });
  }
  return r;
}

const mockSolicitacoes: SolicitacoesService = {
  async minhas() {
    await delay();
    const lista = [...registros.values()].filter((d) => d.status !== "cancelada");
    const conta = (s: StatusSolicitacao[]) => lista.filter((d) => s.includes(d.status)).length;
    return {
      kpis: {
        rascunho: conta(["rascunho"]), emAprovacao: conta(["em_aprovacao"]), devolvida: conta(["devolvida", "pendencia_solicitante"]),
        noFinanceiro: conta(["em_conferencia", "lancamento_gerado", "pagamento_programado"]), aComprovar: conta(["comprovacao_pendente"]), pagasMes: 0, pagasMesValor: 0,
      },
      temFundoFixo: true,
      temSetor: true,
      lista: lista.map((d) => ({
        id: d.id, numero: d.numero, tipo: d.tipo, status: d.status, competencia: d.competencia, vencimento: null, valor: d.totalDespesas,
        pagarAte: d.pagarAte, atualizadoEm: d.atualizadoEm, etapa: d.status === "em_aprovacao" ? { papel: "Gestor", nivel: 1, de: 1 } : null,
      })),
    };
  },
  async criar(tipo) {
    await delay();
    if (tipo === "adiantamento") throw new ServiceError("INVALID_INPUT", "Tipo de solicitação inválido.");
    const id = proximo++;
    const hoje = new Date();
    const de = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
    const ate = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);
    const d: Detalhe = {
      id, numero: `SF-${hoje.getFullYear()}-${String(id).padStart(4, "0")}`, tipo, status: "rascunho", ciclo: 1, podeEditar: true, podeCancelar: true,
      solicitante: { id: currentActor().id, nome: currentActor().name, cpfMascarado: "***.456.789-**" }, setor: { id: 1, nome: "Obra - Arte Wave" },
      competencia: de, periodoDe: de, periodoAte: ate, centroCusto: null,
      valorFundoFixo: tipo === "fundo_fixo" ? 1000 : null, saldoInicial: tipo === "fundo_fixo" ? 1000 : null, totalDespesas: 0,
      saldoFinal: tipo === "fundo_fixo" ? 1000 : null, valorGlosado: 0, valorAPagar: 0, pagarAte: null, enviadoEm: null, aceiteEm: null,
      criadoEm: hoje.toISOString(), atualizadoEm: hoje.toISOString(), itens: [], aprovacoes: [], eventos: [{ tipo: "criada", em: hoje.toISOString(), ator: currentActor().name, payload: {} }],
      cadeiaPrevista: [], categorias: ["Material de obra", "Ferramentas", "EPI", "Combustível", "Transporte", "Estacionamento", "Alimentação", "Copa/mantimentos", "Material de escritório", "Outros"].map((nome, i) => ({ id: i + 1, nome })),
    };
    recalcular(d);
    registros.set(id, d);
    return id;
  },
  async detalhe(id) {
    await delay();
    const d = registros.get(id);
    if (!d) throw new ServiceError("NOT_FOUND", "Solicitação não encontrada.");
    return structuredClone({ ...d, podeEditar: ["rascunho", "devolvida"].includes(d.status) });
  },
  async salvar(p) {
    await delay();
    const d = exigirEditavel(p.id);
    Object.assign(d, { competencia: p.competencia, periodoDe: p.periodoDe, periodoAte: p.periodoAte, centroCusto: p.centroCusto });
    const mapa = p.itens.map((l, i) => {
      const atual = d.itens.find((x) => x.id === l.id);
      const item: Item = { ...(atual ?? { anexos: [], origem: "manual", statusConferencia: "pendente" }), id: atual?.id ?? proximoItem++, ordem: i + 1,
        data: l.data, valor: l.valor, descricao: l.descricao, motivo: l.motivo, categoriaId: l.categoriaId } as Item;
      return item;
    });
    d.itens = mapa;
    recalcular(d);
    return { itens: p.itens.map((l, i) => ({ chave: l.chave, id: mapa[i].id })) };
  },
  async anexar({ solicitacaoId, itemId, arquivo }) {
    await delay();
    const invalido = validarArquivo(arquivo);
    if (invalido) throw invalido;
    const d = exigirEditavel(solicitacaoId);
    const item = d.itens.find((i) => i.id === itemId);
    if (!item) throw new ServiceError("NOT_FOUND", "Linha não encontrada.");
    const id = Date.now();
    const path = `mock/${solicitacaoId}/${id}-${arquivo.name}`;
    arquivos.set(path, arquivo);
    item.anexos.push({ id, nome: arquivo.name, path, mime: arquivo.type, tamanho: arquivo.size });
    return { id, duplicadoEm: null };
  },
  async removerAnexo(id) {
    await delay();
    for (const d of registros.values()) for (const i of d.itens) i.anexos = i.anexos.filter((a) => a.id !== id);
  },
  async urlAnexo(path) {
    const blob = arquivos.get(path);
    if (!blob) throw new ServiceError("NOT_FOUND", "Não foi possível abrir o arquivo.");
    return URL.createObjectURL(blob);
  },
  async checagens(id) {
    await delay();
    const d = registros.get(id);
    return d ? checar(d) : [];
  },
  async enviar(id) {
    await delay();
    const d = exigirEditavel(id);
    if (d.itens.length === 0) throw new ServiceError("INVALID_INPUT", "Inclua ao menos uma despesa.", "itens");
    const falta = d.itens.filter((i) => !i.data || !i.valor || !i.descricao || !i.motivo).length;
    if (falta) throw new ServiceError("INVALID_INPUT", `Preencha data, valor, descrição e motivo em todas as linhas (${falta} incompleta${falta > 1 ? "s" : ""}).`, "itens");
    const bloq = checar(d).filter((c) => c.resultado === "bloqueio");
    if (bloq.length) throw new ServiceError("INVALID_INPUT", `${bloq[0].codigo}: ${bloq[0].detalhe}`);
    d.status = "em_aprovacao";
    d.enviadoEm = d.aceiteEm = new Date().toISOString();
    d.aprovacoes = [{ ciclo: d.ciclo, nivel: 1, papel: "Gestor", status: "aguardando", comentario: null, aprovador: "Marina Costa", substituto: "Ana Prado", prazoEm: null, decididoEm: null }];
    d.eventos.push({ tipo: "enviada", em: d.enviadoEm, ator: currentActor().name, payload: {} });
    return { status: "em_aprovacao", alertas: 0 };
  },
  async cancelar(id) {
    await delay();
    const d = registros.get(id);
    if (!d) throw new ServiceError("NOT_FOUND", "Solicitação não encontrada.");
    d.status = "cancelada";
  },
};

export const solicitacoesService: SolicitacoesService = DATA_SOURCE === "mock" ? mockSolicitacoes : supabaseSolicitacoes;

// ---------- Fase 3: aprovação (migration 20261017120000) ----------

export type AbaAprovacao = "aguardando" | "aprovadas" | "setor";
export type Decisao = "aprovar" | "devolver" | "reprovar";

export interface LinhaAprovacao {
  id: number;
  numero: string;
  tipo: TipoSolicitacao;
  status: StatusSolicitacao;
  solicitante: string;
  setor: string | null;
  valor: number;
  atualizadoEm: string;
  nivel: number | null;
  papel: string | null;
  de: number;
  desde: string | null;
  prazoEm: string | null;
  escaladoEm: string | null;
  /** Decidindo como substituto de alguém. */
  substitutoDe: string | null;
  alertas: number;
  decisao: string | null;
  decididoEm: string | null;
}

export interface FilaAprovacao {
  contagem: number;
  ehAprovador: boolean;
  substituicoes: { id: number; substituto: string; de: string; ate: string }[];
  usuarios: { id: string; nome: string }[];
  lista: LinhaAprovacao[];
}

export interface DetalheExtra {
  podeDecidir: boolean;
  etapa: { nivel: number; papel: string; prazoEm: string | null; emNomeDe: string | null } | null;
  regras: { codigo: string; nome: string; resultado: "ok" | "alerta" | "bloqueio"; detalhe: string | null; itemId: number | null }[];
}

export interface AprovacaoService {
  fila(aba: AbaAprovacao): Promise<FilaAprovacao>;
  extra(id: number): Promise<DetalheExtra>;
  decidir(p: { id: number; decisao: Decisao; comentario: string | null }): Promise<{ status: string; proximo?: string }>;
  definirSubstituto(p: { substitutoId: string; de: string; ate: string }): Promise<void>;
  removerSubstituto(id: number): Promise<void>;
}

const supabaseAprovacao: AprovacaoService = {
  fila: async (aba) => {
    const f = await rpc<FilaAprovacao>("sf_aprovacoes_fila", { p_aba: aba });
    return { ...f, lista: f.lista.map((l) => ({ ...l, valor: Number(l.valor) })) };
  },
  extra: (id) => rpc<DetalheExtra>("sf_detalhe_extra", { p_id: id }),
  decidir: (p) => rpc("sf_decidir_aprovacao", { p_id: p.id, p_decisao: p.decisao, p_comentario: p.comentario }),
  definirSubstituto: async (p) => {
    await rpc("sf_substituto_definir", { p: p as unknown as Json });
  },
  removerSubstituto: (id) => rpc<void>("sf_substituto_remover", { p_id: id }),
};

// Modo simulado: o próprio solicitante aprova a etapa (só para ver as telas).
const substituicoesMock: FilaAprovacao["substituicoes"] = [];
const mockAprovacao: AprovacaoService = {
  async fila(aba) {
    await delay();
    const lista: LinhaAprovacao[] = [...registros.values()]
      .filter((d) => (aba === "aguardando" ? d.status === "em_aprovacao" : aba === "aprovadas" ? d.aprovacoes.some((a) => a.status === "aprovado") : d.status !== "rascunho"))
      .map((d) => {
        const a = d.aprovacoes.find((x) => x.status === "aguardando");
        return {
          id: d.id, numero: d.numero, tipo: d.tipo, status: d.status, solicitante: d.solicitante.nome, setor: d.setor?.nome ?? null, valor: d.totalDespesas,
          atualizadoEm: d.atualizadoEm, nivel: a?.nivel ?? null, papel: a?.papel ?? null, de: d.aprovacoes.length, desde: d.enviadoEm,
          prazoEm: new Date(Date.now() + 46 * 3600_000).toISOString(), escaladoEm: null, substitutoDe: null, alertas: 0,
          decisao: d.aprovacoes.find((x) => x.status === "aprovado") ? "aprovado" : null, decididoEm: null,
        };
      });
    return { contagem: [...registros.values()].filter((d) => d.status === "em_aprovacao").length, ehAprovador: true, substituicoes: substituicoesMock,
      usuarios: [{ id: "u-ana", nome: "Ana Prado" }, { id: "u-paulo", nome: "Paulo Mendes" }], lista };
  },
  async extra(id) {
    await delay();
    const d = registros.get(id);
    const a = d?.aprovacoes.find((x) => x.status === "aguardando");
    return { podeDecidir: !!a, etapa: a ? { nivel: a.nivel, papel: a.papel, prazoEm: a.prazoEm, emNomeDe: null } : null, regras: [] };
  },
  async decidir({ id, decisao, comentario }) {
    await delay();
    const d = registros.get(id);
    const a = d?.aprovacoes.find((x) => x.status === "aguardando");
    if (!d || !a) throw new ServiceError("FORBIDDEN", "Esta solicitação não está aguardando a sua aprovação.");
    if (decisao !== "aprovar" && !comentario?.trim()) throw new ServiceError("INVALID_INPUT", "Escreva o motivo para devolver ou reprovar.", "comentario");
    a.status = decisao === "aprovar" ? "aprovado" : decisao === "devolver" ? "devolvido" : "reprovado";
    a.comentario = comentario;
    a.decididoEm = new Date().toISOString();
    d.status = decisao === "aprovar" ? "em_conferencia" : decisao === "devolver" ? "devolvida" : "reprovada";
    if (decisao === "aprovar") d.pagarAte = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
    if (decisao === "devolver") d.ciclo += 1;
    return { status: d.status };
  },
  async definirSubstituto(p) {
    await delay();
    if (!p.substitutoId) throw new ServiceError("INVALID_INPUT", "Escolha outra pessoa ativa como substituta.", "substitutoId");
    if (!p.de || !p.ate || p.ate < p.de) throw new ServiceError("INVALID_INPUT", "Informe o período (fim igual ou depois do início).", "ate");
    substituicoesMock.push({ id: Date.now(), substituto: p.substitutoId === "u-ana" ? "Ana Prado" : "Paulo Mendes", de: p.de, ate: p.ate });
  },
  async removerSubstituto(id) {
    await delay();
    substituicoesMock.splice(substituicoesMock.findIndex((s) => s.id === id), 1);
  },
};

export const aprovacaoService: AprovacaoService = DATA_SOURCE === "mock" ? mockAprovacao : supabaseAprovacao;
