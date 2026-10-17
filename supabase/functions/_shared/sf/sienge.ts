// Solicitações Financeiras, Fase 5: integração SIENGE (API REST pública). Módulo puro (sem rede): endereço,
// autenticação Basic, montagem do título a pagar (POST /bills) e leitura das respostas. Campos conforme o Swagger
// oficial bill-debt-v1 (BillInsert / BillBudgetCategoriesInsert), lido em 17/10/2026.

export interface ConfigSienge {
  ativo: boolean;
  ambiente: "homologacao" | "producao";
  subdominio: string | null;
  usuario: string | null;
  senha: string | null;
  empresaId: number | null;
  tipoDocumento: string | null;
  indexadorId: number | null;
  planoReembolso: string | null;
  planoFundoFixo: string | null;
  planoAdiantamento: string | null;
  centroCustoPadrao: number | null;
}

export interface PedidoLancamento {
  id: number;
  numero: string;
  tipo: "reembolso" | "fundo_fixo" | "adiantamento";
  cpf: string;
  solicitante: string;
  setor: string | null;
  competencia: string | null;
  ultimaAprovacaoEm: string | null;
  pagarAte: string | null;
  vencimento: string | null;
  total: number;
  glosado: number;
  aPagar: number;
}

export interface EscolhasLancamento {
  credorId: number;
  centroCustoId: number;
  plano: string;
  vencimento: string;
}

export interface TituloSienge {
  debtorId: number;
  creditorId: number;
  documentIdentificationId: string;
  documentNumber: string;
  issueDate: string;
  installmentsNumber: number;
  indexId: number;
  baseDate: string;
  dueDate: string;
  billDate: string;
  totalInvoiceAmount: number;
  notes: string;
  discount: number;
  budgetCategories: { costCenterId: number; paymentCategoriesId: string; percentage: number }[];
}

const TIPO: Record<PedidoLancamento["tipo"], string> = { reembolso: "Reembolso", fundo_fixo: "Fundo fixo", adiantamento: "Adiantamento" };

export function urlBase(subdominio: string): string {
  return `https://api.sienge.com.br/${encodeURIComponent(subdominio)}/public/api/v1`;
}

export function autorizacao(usuario: string, senha: string): string {
  const bytes = new TextEncoder().encode(`${usuario}:${senha}`);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return `Basic ${btoa(s)}`;
}

/** O que falta na configuração para lançar (vazio = pronta). */
export function faltandoNaConfig(c: ConfigSienge): string[] {
  const falta: string[] = [];
  if (!c.ativo) falta.push("integração ativa");
  if (!c.subdominio) falta.push("subdomínio");
  if (!c.usuario) falta.push("usuário");
  if (!c.senha) falta.push("senha");
  if (!c.empresaId) falta.push("empresa pagadora");
  if (!c.tipoDocumento) falta.push("tipo de documento");
  if (c.indexadorId == null) falta.push("indexador");
  return falta;
}

export function planoDoTipo(c: ConfigSienge, tipo: PedidoLancamento["tipo"]): string | null {
  return tipo === "reembolso" ? c.planoReembolso : tipo === "fundo_fixo" ? c.planoFundoFixo : c.planoAdiantamento;
}

const dia = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
const hoje = () => new Date().toISOString().slice(0, 10);

/** Título a pagar (POST /bills): uma parcela, valor a pagar (já sem as glosas), rateio 100% no centro de custo. */
export function montarTitulo(p: PedidoLancamento, c: ConfigSienge, e: EscolhasLancamento): TituloSienge {
  const emissao = dia(p.ultimaAprovacaoEm) ?? hoje();
  const notas = [
    `${TIPO[p.tipo]} ${p.numero} - ${p.solicitante}`,
    p.setor ? `Setor ${p.setor}` : null,
    p.glosado > 0 ? `Total ${p.total.toFixed(2)} - glosas ${p.glosado.toFixed(2)}` : null,
    "Lançado pelo Portal de Tickets (Solicitações Financeiras)",
  ].filter(Boolean).join(" · ");
  return {
    debtorId: c.empresaId!,
    creditorId: e.credorId,
    documentIdentificationId: c.tipoDocumento!,
    documentNumber: p.numero.slice(0, 20),
    issueDate: emissao,
    installmentsNumber: 1,
    indexId: c.indexadorId!,
    baseDate: emissao,
    dueDate: e.vencimento,
    billDate: dia(p.competencia) ?? emissao,
    totalInvoiceAmount: Math.round(p.aPagar * 100) / 100,
    notes: notas.slice(0, 500),
    discount: 0,
    budgetCategories: [{ costCenterId: e.centroCustoId, paymentCategoriesId: e.plano, percentage: 100 }],
  };
}

/** Valida as escolhas do conferente antes de chamar a API. */
export function validarEscolhas(e: Partial<EscolhasLancamento>): string | null {
  if (!e.centroCustoId || !Number.isInteger(e.centroCustoId) || e.centroCustoId <= 0) return "Escolha o centro de custo do SIENGE.";
  if (!e.plano || !/^\d{1,9}$/.test(e.plano)) return "Informe o plano financeiro (só números, sem máscara).";
  if (!e.vencimento || !/^\d{4}-\d{2}-\d{2}$/.test(e.vencimento)) return "Informe o vencimento.";
  return null;
}

/** Listas do SIENGE vêm em { resultSetMetadata, results: [...] }. */
export function resultados<T>(corpo: unknown): T[] {
  if (corpo && typeof corpo === "object" && Array.isArray((corpo as { results?: unknown }).results)) return (corpo as { results: T[] }).results;
  return Array.isArray(corpo) ? (corpo as T[]) : [];
}

/** Mensagem do SIENGE (ResponseMenssage: developerMessage / clientMessage / message). */
export function mensagemSienge(status: number, texto: string): string {
  try {
    const j = JSON.parse(texto) as Record<string, unknown>;
    const m = j.clientMessage ?? j.developerMessage ?? j.message;
    if (typeof m === "string" && m.trim()) return `SIENGE ${status}: ${m.trim()}`.slice(0, 500);
  } catch {
    // corpo não é JSON
  }
  if (status === 401) return "SIENGE 401: usuário ou senha da API inválidos.";
  if (status === 403) return "SIENGE 403: o usuário da API não tem acesso a este recurso.";
  if (status === 404) return "SIENGE 404: subdomínio ou endereço não encontrado.";
  if (status === 429) return "SIENGE 429: limite de chamadas por minuto atingido. Tente de novo em instantes.";
  return `SIENGE ${status}: ${texto.slice(0, 200) || "erro sem detalhe"}`;
}

/** Id do título criado: no corpo (id) ou no cabeçalho Location (…/bills/123). */
export function idDoTitulo(corpo: unknown, location: string | null): number | null {
  if (corpo && typeof corpo === "object" && typeof (corpo as { id?: unknown }).id === "number") return (corpo as { id: number }).id;
  const m = location?.match(/\/bills\/(\d+)/);
  return m ? Number(m[1]) : null;
}
