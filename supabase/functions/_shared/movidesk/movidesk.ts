// Movidesk (API pública v1) → linhas das tabelas md_* (migration 20261014100000). TypeScript puro, testado em
// tests/movidesk.test.ts. Comportamento medido (Cerebro: movidesk-api-tickets-comportamento-real):
// - datas em UTC sem o "Z" e com 7 casas nos segundos ("2026-10-14T15:28:40.2494391");
// - serviceFirstLevel é o nível MAIS específico (Third › Second › First para exibir);
// - a descrição da ação vem em HTML; o anexo traz só fileName e path;
// - uma página de 100 com todas as expansões leva de 40 a 70 s.

export const MOVIDESK_API = "https://api.movidesk.com/public/v1";
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** O token é um GUID; o valor colado da URL costuma vir com "&$" no fim. */
export function tokenLimpo(valor: string | null | undefined): string | null {
  return valor?.match(GUID)?.[0].toLowerCase() ?? null;
}

/** "2026-10-14T15:28:40.2494391" (UTC sem fuso) → "2026-10-14T15:28:40.249439Z". Vazio ou inválido → null. */
export function dataUtc(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const m = valor.trim().match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i);
  if (!m) return null;
  const fracao = m[2] ? m[2].slice(0, 7) : "";
  const iso = `${m[1]}${fracao}${m[3] ?? "Z"}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

const ENTIDADES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };

/** HTML da ação → texto legível (quebras de linha preservadas, sem tags). */
export function textoDeHtml(html: unknown): string {
  if (typeof html !== "string") return "";
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/gi, (todo, e: string) => {
      if (e[0] === "#") {
        const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : todo;
      }
      return ENTIDADES[e.toLowerCase()] ?? todo;
    })
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const inteiro = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

interface Pessoa {
  id?: string;
  businessName?: string | null;
  email?: string | null;
  organization?: Pessoa | null;
}

/** Ticket como a API devolve (só o que o mapeador lê). */
export interface TicketMovidesk {
  id: number;
  protocol?: string | null;
  type?: number | null;
  subject?: string | null;
  category?: string | null;
  urgency?: string | null;
  status?: string | null;
  baseStatus?: string | null;
  justification?: string | null;
  origin?: number | null;
  createdDate?: string | null;
  originEmailAccount?: string | null;
  ownerTeam?: string | null;
  serviceFirstLevelId?: number | null;
  serviceFirstLevel?: string | null;
  serviceSecondLevel?: string | null;
  serviceThirdLevel?: string | null;
  contactForm?: string | null;
  cc?: string | null;
  resolvedIn?: string | null;
  reopenedIn?: string | null;
  closedIn?: string | null;
  lastActionDate?: string | null;
  actionCount?: number | null;
  lastUpdate?: string | null;
  lifeTimeWorkingTime?: number | null;
  stoppedTime?: number | null;
  stoppedTimeWorkingTime?: number | null;
  resolvedInFirstCall?: boolean | null;
  chatWidget?: string | null;
  chatGroup?: string | null;
  chatTalkTime?: number | null;
  chatWaitingTime?: number | null;
  sequence?: number | null;
  slaAgreement?: string | null;
  slaAgreementRule?: string | null;
  slaSolutionTime?: number | null;
  slaResponseTime?: number | null;
  slaSolutionChangedByUser?: boolean | null;
  slaSolutionDate?: string | null;
  slaSolutionDateIsPaused?: boolean | null;
  slaResponseDate?: string | null;
  slaRealResponseDate?: string | null;
  owner?: Pessoa | null;
  createdBy?: Pessoa | null;
  clients?: Pessoa[] | null;
  customFieldValues?: { customFieldId?: number; customFieldRuleId?: number; line?: number; value?: string | null; items?: unknown }[] | null;
  actions?: {
    id: number;
    type?: number | null;
    origin?: number | null;
    status?: string | null;
    justification?: string | null;
    description?: string | null;
    htmlDescription?: string | null;
    createdDate?: string | null;
    createdBy?: Pessoa | null;
    isDeleted?: boolean | null;
    attachments?: { fileName?: string | null; path?: string | null; createdDate?: string | null }[] | null;
  }[] | null;
  statusHistories?: { status?: string | null; justification?: string | null; changedDate?: string | null; changedBy?: Pessoa | null; permanencyTimeWorkingTime?: number | null }[] | null;
  ownerHistories?: { ownerTeam?: string | null; owner?: Pessoa | null; changedDate?: string | null; changedBy?: Pessoa | null; permanencyTimeWorkingTime?: number | null }[] | null;
}

/** Página pronta para portal_atendimento.md_upsert_pagina. */
export interface PaginaMapeada {
  tickets: Record<string, unknown>[];
  acoes: Record<string, unknown>[];
  statusHist: Record<string, unknown>[];
  responsavelHist: Record<string, unknown>[];
  /** Maior id da página (cursor da próxima). */
  ultimoId: number | null;
  /** Maior lastUpdate da página (ISO UTC), para o incremental. */
  maiorUpdate: string | null;
}

/** Caminho do serviço do geral para o específico: Third › Second › First. */
export function caminhoServico(t: Pick<TicketMovidesk, "serviceFirstLevel" | "serviceSecondLevel" | "serviceThirdLevel">): string | null {
  const partes = [t.serviceThirdLevel, t.serviceSecondLevel, t.serviceFirstLevel].map(texto).filter((p): p is string => !!p);
  return partes.length ? partes.join(" › ") : null;
}

export function mapearPagina(lista: TicketMovidesk[]): PaginaMapeada {
  const pagina: PaginaMapeada = { tickets: [], acoes: [], statusHist: [], responsavelHist: [], ultimoId: null, maiorUpdate: null };
  for (const t of lista) {
    if (!Number.isInteger(t.id)) continue;
    const atualizado = dataUtc(t.lastUpdate);
    pagina.ultimoId = Math.max(pagina.ultimoId ?? 0, t.id);
    if (atualizado && (!pagina.maiorUpdate || Date.parse(atualizado) > Date.parse(pagina.maiorUpdate))) pagina.maiorUpdate = atualizado;

    pagina.tickets.push({
      id: t.id,
      protocolo: texto(t.protocol),
      tipo: inteiro(t.type),
      assunto: texto(t.subject),
      categoria: texto(t.category),
      urgencia: texto(t.urgency),
      status: texto(t.status),
      status_base: texto(t.baseStatus),
      justificativa: texto(t.justification),
      origem: inteiro(t.origin),
      criado_em: dataUtc(t.createdDate),
      conta_email_origem: texto(t.originEmailAccount),
      equipe: texto(t.ownerTeam),
      servico_1_id: inteiro(t.serviceFirstLevelId),
      servico_1: texto(t.serviceFirstLevel),
      servico_2: texto(t.serviceSecondLevel),
      servico_3: texto(t.serviceThirdLevel),
      servico: caminhoServico(t),
      forma_contato: texto(t.contactForm),
      cc: texto(t.cc),
      resolvido_em: dataUtc(t.resolvedIn),
      reaberto_em: dataUtc(t.reopenedIn),
      fechado_em: dataUtc(t.closedIn),
      ultima_acao_em: dataUtc(t.lastActionDate),
      qtd_acoes: inteiro(t.actionCount),
      atualizado_movidesk: atualizado,
      tempo_vida_util: numero(t.lifeTimeWorkingTime),
      tempo_parado: numero(t.stoppedTime),
      tempo_parado_util: numero(t.stoppedTimeWorkingTime),
      resolvido_primeiro_contato: bool(t.resolvedInFirstCall),
      chat_widget: texto(t.chatWidget),
      chat_grupo: texto(t.chatGroup),
      chat_conversa: numero(t.chatTalkTime),
      chat_espera: numero(t.chatWaitingTime),
      sequencia: inteiro(t.sequence),
      sla_acordo: texto(t.slaAgreement),
      sla_regra: texto(t.slaAgreementRule),
      sla_solucao_min: numero(t.slaSolutionTime),
      sla_resposta_min: numero(t.slaResponseTime),
      sla_solucao_alterado: bool(t.slaSolutionChangedByUser),
      sla_solucao_em: dataUtc(t.slaSolutionDate),
      sla_solucao_pausado: bool(t.slaSolutionDateIsPaused),
      sla_resposta_em: dataUtc(t.slaResponseDate),
      sla_resposta_real_em: dataUtc(t.slaRealResponseDate),
      responsavel_id: texto(t.owner?.id),
      responsavel: texto(t.owner?.businessName),
      responsavel_email: texto(t.owner?.email),
      criado_por_id: texto(t.createdBy?.id),
      criado_por: texto(t.createdBy?.businessName),
      clientes: (t.clients ?? []).map((c) => ({
        id: texto(c.id),
        nome: texto(c.businessName),
        email: texto(c.email),
        organizacao: texto(c.organization?.businessName),
      })),
      campos_adicionais: (t.customFieldValues ?? []).map((c) => ({
        campo: c.customFieldId ?? null,
        regra: c.customFieldRuleId ?? null,
        linha: c.line ?? null,
        valor: c.value ?? null,
        ...(c.items ? { itens: c.items } : {}),
      })),
    });

    for (const a of t.actions ?? []) {
      if (!Number.isInteger(a.id) || a.isDeleted) continue;
      pagina.acoes.push({
        ticket_id: t.id,
        acao_id: a.id,
        tipo: inteiro(a.type),
        origem: inteiro(a.origin),
        status: texto(a.status),
        justificativa: texto(a.justification),
        texto: textoDeHtml(a.htmlDescription || a.description) || null,
        criado_em: dataUtc(a.createdDate),
        criado_por_id: texto(a.createdBy?.id),
        criado_por: texto(a.createdBy?.businessName),
        anexos: (a.attachments ?? [])
          .filter((x) => texto(x.fileName))
          .map((x) => ({ nome: texto(x.fileName), caminho: texto(x.path), em: dataUtc(x.createdDate) })),
      });
    }
    (t.statusHistories ?? []).forEach((h, i) =>
      pagina.statusHist.push({
        ticket_id: t.id,
        seq: i + 1,
        status: texto(h.status),
        justificativa: texto(h.justification),
        alterado_em: dataUtc(h.changedDate),
        alterado_por: texto(h.changedBy?.businessName),
        permanencia_util: numero(h.permanencyTimeWorkingTime),
      }),
    );
    (t.ownerHistories ?? []).forEach((h, i) =>
      pagina.responsavelHist.push({
        ticket_id: t.id,
        seq: i + 1,
        responsavel: texto(h.owner?.businessName),
        equipe: texto(h.ownerTeam),
        alterado_em: dataUtc(h.changedDate),
        alterado_por: texto(h.changedBy?.businessName),
        permanencia_util: numero(h.permanencyTimeWorkingTime),
      }),
    );
  }
  return pagina;
}

export interface PedidoPagina {
  token: string;
  rota: string;
  select: string;
  expand: string;
  filtro: string;
  top?: number;
  orderby?: string;
}

export interface RespostaPagina {
  http: number;
  ms: number;
  kb: number;
  tickets: TicketMovidesk[];
}

/** Mensagem curta para a tela (nunca inclui o token). */
export function erroMovidesk(http: number, corpo: string): string {
  if (http === 401 || http === 403) return `O Movidesk recusou o token (HTTP ${http}). Confira o token em Integrações › Movidesk.`;
  if (http === 429) return "O Movidesk limitou as requisições (HTTP 429). A próxima rodada tenta de novo.";
  const detalhe = corpo.replace(/\s+/g, " ").trim().slice(0, 200);
  return `O Movidesk respondeu HTTP ${http}${detalhe ? `: ${detalhe}` : ""}.`;
}

/** Busca uma página. Lança Error com a mensagem para a tela se o HTTP não for 2xx ou o corpo não for lista. */
export async function buscarPagina(fetcher: typeof fetch, p: PedidoPagina, timeoutMs = 120_000): Promise<RespostaPagina> {
  const params = new URLSearchParams({ token: p.token, $select: p.select, $filter: p.filtro, $orderby: p.orderby ?? "id asc", $top: String(p.top ?? 100) });
  if (p.expand.trim()) params.set("$expand", p.expand.trim());
  const inicio = Date.now();
  const r = await fetcher(`${MOVIDESK_API}/${p.rota}?${params}`, { signal: AbortSignal.timeout(timeoutMs) });
  const corpo = await r.text();
  const ms = Date.now() - inicio;
  if (!r.ok) throw Object.assign(new Error(erroMovidesk(r.status, corpo)), { http: r.status, ms });
  let dados: unknown;
  try {
    dados = JSON.parse(corpo);
  } catch {
    throw Object.assign(new Error("O Movidesk devolveu uma resposta que não é JSON."), { http: r.status, ms });
  }
  if (!Array.isArray(dados)) throw Object.assign(new Error("O Movidesk devolveu algo que não é uma lista de tickets."), { http: r.status, ms });
  return { http: r.status, ms, kb: Math.round(corpo.length / 1024), tickets: dados as TicketMovidesk[] };
}

/** Nome de arquivo seguro para o caminho do Storage (sem acento, sem barra, até 120 letras, extensão preservada). */
export function nomeArquivoSeguro(nome: string): string {
  const limpo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "");
  if (!limpo) return "arquivo";
  if (limpo.length <= 120) return limpo;
  const ext = limpo.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? "";
  return limpo.slice(0, 120 - ext.length) + ext;
}

/** Caminho do anexo no bucket movidesk-anexos. */
export function caminhoStorage(a: { ticketId: number; acaoId: number; id: number; nome: string }): string {
  return `movidesk/${a.ticketId}/${a.acaoId}/${a.id}-${nomeArquivoSeguro(a.nome)}`;
}

export class AnexoGrande extends Error {
  constructor(readonly tamanho: number, maxBytes: number) {
    super(`Maior que ${Math.round(maxBytes / 1024 / 1024)} MB (${Math.round(tamanho / 1024 / 1024)} MB).`);
  }
}

/**
 * Baixa um anexo: GET /storage/download?token=…&id=<path> redireciona para o arquivo em <conta>.movidesk.com.
 * Lança AnexoGrande acima de maxBytes (pelo Content-Length, ou depois de baixar) e Error com mensagem para a tela.
 */
export async function baixarAnexo(fetcher: typeof fetch, token: string, caminho: string, maxBytes: number, timeoutMs = 60_000): Promise<{ bytes: Uint8Array; tipo: string }> {
  const params = new URLSearchParams({ token, id: caminho });
  const r = await fetcher(`${MOVIDESK_API}/storage/download?${params}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    throw new Error(erroMovidesk(r.status, corpo));
  }
  const declarado = Number(r.headers.get("content-length") ?? "");
  if (Number.isFinite(declarado) && declarado > maxBytes) {
    await r.body?.cancel().catch(() => {});
    throw new AnexoGrande(declarado, maxBytes);
  }
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new AnexoGrande(bytes.byteLength, maxBytes);
  const tipo = (r.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim() || "application/octet-stream";
  return { bytes, tipo };
}