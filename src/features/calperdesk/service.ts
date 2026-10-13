import type { Json } from "../../lib/database.types";
import { central, supabase } from "../../lib/supabase";
import { APP_SCHEMA, edgeFunction } from "../../config/app";
import { fromFunction, fromPostgrest } from "../configuracoes/services/supabase/errors";
import { ServiceError } from "../configuracoes/services/types";

// CalperDESK: app do solicitante (docs/PLANO-calperdesk.md). Regras no banco (RPCs cd_*): só os próprios tickets,
// sessão confiável e e-mail @calper.com.br. Anexos no bucket privado "calperdesk", na pasta do próprio usuário.

export const BUCKET = "calperdesk";
export const MAX_ARQUIVO = 10 * 1024 * 1024;
export const MAX_ANEXOS = 5;

export interface Departamento {
  id: number;
  nome: string;
  icone: string;
  descricao: string | null;
}

export interface Quadros {
  meus: boolean;
  avisos: boolean;
  solucoes: boolean;
  whatsapp: boolean;
  perfil: boolean;
}

export interface Entrada {
  usuarioId: string;
  nome: string;
  email: string;
  telefone: string | null;
  pessoaId: number | null;
  perfil: string | null;
  /** Tem perfil de equipe (operador, admin…): mostra o atalho para o portal. */
  equipe: boolean;
  simulando: boolean;
  setores: Departamento[];
  config: { quadros: Quadros; whatsapp: string | null; boasVindas: string };
}

export interface Servico {
  id: number;
  paiId: number | null;
  nome: string;
  nivel: number;
  descricao: string | null;
}

export interface StatusTicket {
  id: number;
  nome: string;
  categoria: "novo" | "andamento" | "pendente" | "resolvido" | "fechado" | "cancelado";
}

export interface ChamadoResumo {
  id: number;
  assunto: string;
  origem: string;
  setor: string | null;
  servico: string | null;
  status: StatusTicket;
  responsavel: string | null;
  criadoEm: string;
  slaRespostaAte: string | null;
  primeiraRespostaEm: string | null;
  encerradoEm: string | null;
  ultima: { autor: string; texto: string; direcao: "entrada" | "saida"; em: string } | null;
  novo: boolean;
}

export interface MeusChamados {
  abertos: number;
  recentes: number;
  novos: number;
  itens: ChamadoResumo[];
}

export interface Anexo {
  bucket?: string | null;
  path?: string | null;
  nome?: string | null;
  mime?: string | null;
  tamanho?: number | null;
  url?: string | null;
  erro?: string | null;
}

export interface Chamado {
  id: number;
  assunto: string;
  origem: string;
  setor: string | null;
  servico: string | null;
  status: StatusTicket;
  responsavel: string | null;
  criadoEm: string;
  slaRespostaAte: string | null;
  encerradoEm: string | null;
  solucao: string | null;
  podeResponder: boolean;
  aguardandoConfirmacao: boolean;
  acoes: { numero: number; direcao: "entrada" | "saida"; canal: string; autorNome: string; texto: string; anexos: Anexo[]; criadoEm: string }[];
  eventos: { tipo: string; descricao: string; autorNome: string; criadoEm: string }[];
}

export interface Aviso {
  id: number;
  titulo: string;
  texto: string;
  tipo: "comunicado" | "manutencao" | "alerta" | "resolvido";
  link: string | null;
  inicio: string;
  fim: string | null;
  setor: string | null;
}

export interface Solucao {
  id: number;
  titulo: string;
  texto: string;
  usos: number;
  servico: string | null;
}

/** Empreendimento do site www.calper.com.br (Edge portal_atendimento-calper-site, com cache). */
export interface Empreendimento {
  nome: string;
  info: string;
  imagem: string | null;
  link: string;
}

export interface NovoChamado {
  setorId: number;
  servicoId: number | null;
  /** Obrigatório quando o setor pede (Administração › Empreendimentos, ex.: CFTV). */
  empreendimentoId: number | null;
  descricao: string;
  urgente: boolean;
  anexos: Anexo[];
}

export interface EmpreendimentosSetor {
  pedir: boolean;
  lista: { id: number; nome: string; apelidos: string[]; cidade: string | null }[];
}

// ---------- Administração ----------

export interface SetorApp {
  id: number;
  nome: string;
  visivel: boolean;
  icone: string | null;
  descricao: string | null;
  ordem: number;
  servicos: number;
}

export interface AvisoAdmin {
  id: number;
  setorId: number | null;
  titulo: string;
  texto: string;
  tipo: Aviso["tipo"];
  link: string | null;
  inicio: string;
  fim: string | null;
  ativo: boolean;
}

export interface SolucaoAdmin {
  id: number;
  setorId: number;
  servicoId: number | null;
  servico: string | null;
  ticketId: number | null;
  titulo: string;
  texto: string;
  publicado: boolean;
  usos: number;
}

export interface PainelCalperdesk {
  config: { quadros: Quadros; whatsapp: string | null; boasVindas: string };
  setores: SetorApp[];
  avisos: AvisoAdmin[];
  solucoes: SolucaoAdmin[];
  sugestoes: { ticketId: number; assunto: string; setorId: number; servicoId: number | null; servico: string | null; solucao: string }[];
  solicitantes: number;
  chamadosApp30d: number;
}

async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome as never, args as never);
  if (error) throw fromPostgrest(error);
  return data as T;
}

const json = (v: unknown) => v as unknown as Json;

export const calperdesk = {
  entrar: (como: string | null) => rpc<Entrada>("cd_entrar", { p_como: como }),
  /** Permissões por aplicativo (Central): bloqueio manual do Super admin vale também no app. */
  async podeAcessar(): Promise<boolean> {
    const r = await central.rpc("pode_acessar_app", { p_app: APP_SCHEMA });
    if (r.error) return r.error.code === "PGRST202";
    return r.data !== false;
  },
  salvarPerfil: (p: { nome: string; telefone: string }) => rpc<void>("cd_perfil_salvar", { p: json(p) }),
  servicos: (setor: number) => rpc<Servico[]>("cd_servicos", { p_setor: setor }),
  empreendimentosDoSetor: (setor: number) => rpc<EmpreendimentosSetor>("cd_setor_empreendimentos", { p_setor: setor }),
  meusChamados: (filtro: "abertos" | "resolvidos" | "todos", como: string | null) => rpc<MeusChamados>("cd_meus_chamados", { p_filtro: filtro, p_como: como }),
  avisos: (setor: number | null) => rpc<Aviso[]>("cd_avisos_listar", { p_setor: setor }),
  solucoes: (setor: number, servico: number | null, busca: string | null) =>
    rpc<Solucao[]>("cd_solucoes_listar", { p_setor: setor, p_servico: servico, p_busca: busca }),
  solucaoUsada: (id: number) => rpc<void>("cd_solucao_usada", { p_id: id }),
  criar: (p: NovoChamado) => rpc<{ id: number; servico: string | null; slaRespostaAte: string | null; setor: string; empreendimento?: string | null }>("cd_ticket_criar", { p: json(p) }),
  chamado: (id: number, como: string | null) => rpc<Chamado>("cd_chamado", { p_id: id, p_como: como }),
  responder: (id: number, p: { texto: string; anexos: Anexo[] }) => rpc<void>("cd_chamado_responder", { p_id: id, p: json(p) }),
  confirmar: (id: number, resolveu: boolean, comentario: string | null) =>
    rpc<void>("cd_chamado_confirmar", { p_id: id, p_resolveu: resolveu, p_comentario: comentario }),

  /**
   * Empreendimentos do site: lê o cache pela RPC (mesma sessão do resto do app). Só se o cache estiver vazio ou com
   * mais de 6 h pede à Edge para ler o site de novo; se a Edge falhar, fica com o que o cache tem.
   */
  async empreendimentos(): Promise<Empreendimento[]> {
    const cache = await rpc<{ itens: Empreendimento[]; atualizadoEm: string | null } | null>("cd_empreendimentos");
    const itens = cache?.itens ?? [];
    const velho = !cache?.atualizadoEm || Date.now() - Date.parse(cache.atualizadoEm) > 6 * 3_600_000;
    if (itens.length > 0 && !velho) return itens;
    const { data, error } = await supabase.functions.invoke(edgeFunction("calper-site"), { body: {} });
    if (error) {
      console.warn("[calperdesk] empreendimentos: Edge indisponível, usando o cache", await fromFunction(error).then((e) => e.message));
      return itens;
    }
    const novos = (data as { itens?: Empreendimento[] } | null)?.itens ?? [];
    return novos.length > 0 ? novos : itens;
  },

  /** Envia o arquivo para a pasta do usuário (o banco confere a pasta e se o arquivo existe). */
  async enviarArquivo(usuarioId: string, file: File): Promise<Anexo> {
    if (file.size > MAX_ARQUIVO) throw new ServiceError("INVALID_INPUT", `"${file.name}" passa de 10 MB.`);
    const limpo = file.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-80) || "arquivo";
    const path = `${usuarioId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${limpo}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (error) throw new ServiceError("INTERNAL", `Não foi possível enviar "${file.name}". Tente de novo.`);
    return { bucket: BUCKET, path, nome: file.name.slice(0, 160), mime: file.type || "application/octet-stream", tamanho: file.size };
  },
  async removerArquivo(path: string) {
    await supabase.storage.from(BUCKET).remove([path]);
  },

  // Administração › CalperDESK
  painel: () => rpc<PainelCalperdesk>("cd_admin_painel"),
  pessoas: (busca: string) => rpc<{ id: string; nome: string; email: string; perfil: string | null }[]>("cd_admin_pessoas", { p_busca: busca }),
  salvarSetor: (id: number, p: Partial<Pick<SetorApp, "visivel" | "icone" | "descricao" | "ordem">>) => rpc<void>("cd_admin_setor_salvar", { p_id: id, p: json(p) }),
  salvarConfig: (p: { quadros?: Partial<Quadros>; whatsapp?: string; boasVindas?: string }) => rpc<void>("cd_admin_config_salvar", { p: json(p) }),
  salvarAviso: (p: Partial<AvisoAdmin>) => rpc<number>("cd_aviso_salvar", { p: json(p) }),
  excluirAviso: (id: number) => rpc<void>("cd_aviso_excluir", { p_id: id }),
  salvarSolucao: (p: Partial<SolucaoAdmin>) => rpc<number>("cd_solucao_salvar", { p: json(p) }),
  excluirSolucao: (id: number) => rpc<void>("cd_solucao_excluir", { p_id: id }),
};

/** Telefone para exibir: 5521996453552 → (21) 99645-3552. */
export function formatarTelefone(v: string | null | undefined): string {
  const d = (v ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v ?? "";
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter((p) => p.length > 2 || /^[A-ZÀ-Ú]/.test(p));
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase() || "?";
}
