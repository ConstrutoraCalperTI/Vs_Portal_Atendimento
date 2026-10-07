import type { Json } from "../../../lib/database.types";
import { supabase } from "../../../lib/supabase";
import { DATA_SOURCE } from "../../configuracoes/services";
import { db as dbPortal } from "../../configuracoes/services/mock/db";
import { requireAnyPermission } from "../../configuracoes/services/mock/runtime";
import { fromPostgrest } from "../../configuracoes/services/supabase/errors";
import { ServiceError } from "../../configuracoes/services/types";

// Configurações › Usuários › Equipes: grupos de atendentes dentro de um setor. Um usuário pode estar em
// várias equipes; o líder entra como membro. Leitura e escrita pelas RPCs at_equipe*.

export interface PessoaUsuario {
  id: string;
  nome: string;
  email: string;
}

export interface Equipe {
  id: number;
  nome: string;
  setorId: number | null;
  setorNome: string | null;
  descricao: string | null;
  ativa: boolean;
  lider: PessoaUsuario | null;
  membros: PessoaUsuario[];
}

export interface EquipeSalvar {
  id?: number;
  nome: string;
  setorId: number | null;
  descricao: string;
  liderId: string | null;
  ativa: boolean;
  membros: string[];
}

export interface EquipesService {
  lista(): Promise<Equipe[]>;
  candidatos(): Promise<PessoaUsuario[]>;
  setores(): Promise<{ id: number; nome: string }[]>;
  salvar(p: EquipeSalvar): Promise<number>;
  excluir(id: number): Promise<void>;
  doUsuario(usuarioId: string): Promise<number[]>;
  salvarDoUsuario(usuarioId: string, equipes: number[]): Promise<void>;
}

async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome as never, args as never);
  if (error) throw fromPostgrest(error);
  return data as T;
}

const supabaseEquipes: EquipesService = {
  lista: () => rpc<Equipe[]>("at_equipes_lista"),
  candidatos: () => rpc<PessoaUsuario[]>("at_equipes_candidatos"),
  setores: () => rpc<{ id: number; nome: string }[]>("at_equipes_setores"),
  salvar: (p) => rpc<number>("at_equipe_salvar", { p: p as unknown as Json }),
  excluir: (id) => rpc<void>("at_equipe_excluir", { p_id: id }),
  doUsuario: (usuarioId) => rpc<number[]>("at_usuario_equipes", { p_usuario: usuarioId }),
  salvarDoUsuario: (usuarioId, equipes) => rpc<void>("at_usuario_equipes_salvar", { p_usuario: usuarioId, p_equipes: equipes }),
};

// ---------- Modo simulado ----------
const SETORES = [
  { id: 1, nome: "Financeiro" },
  { id: 2, nome: "Relacionamento com o cliente" },
  { id: 3, nome: "Assistência técnica" },
];
interface EquipeMock {
  id: number;
  nome: string;
  setorId: number | null;
  descricao: string | null;
  ativa: boolean;
  liderId: string | null;
  membros: string[];
}
let seq = 10;
const equipes: EquipeMock[] = [
  { id: 1, nome: "Cobrança", setorId: 1, descricao: "Boletos em atraso e acordos.", ativa: true, liderId: "u-ana", membros: ["u-ana", "u-bruno"] },
  { id: 2, nome: "Contas a receber", setorId: 1, descricao: null, ativa: true, liderId: null, membros: ["u-ana", "u-carla"] },
  { id: 3, nome: "2ª via e boletos", setorId: 1, descricao: null, ativa: true, liderId: null, membros: ["u-bruno"] },
  { id: 4, nome: "Vistoria", setorId: 3, descricao: "Visitas técnicas nos imóveis.", ativa: true, liderId: "u-helena", membros: ["u-helena"] },
  { id: 5, nome: "Plantão de sábado", setorId: 2, descricao: null, ativa: false, liderId: "u-fernanda", membros: ["u-gustavo", "u-fernanda"] },
  // Equipes internas da TI (sem setor): as mesmas dos tickets de exemplo da Gestão de Chamados.
  { id: 6, nome: "Sistemas", setorId: null, descricao: "ERP, portais internos e acessos.", ativa: true, liderId: "u-wagner", membros: ["u-wagner", "u-ana", "u-bruno", "u-carla"] },
  { id: 7, nome: "Infraestrutura", setorId: null, descricao: "Rede, VPN, impressão e equipamentos.", ativa: true, liderId: "u-marcos", membros: ["u-wagner", "u-ana", "u-bruno", "u-marcos"] },
];

/** Modo simulado: equipes ativas e membros, para as visões de Tickets (sem exigir a permissão de Equipes). */
export function equipesAtivasMock(): { id: number; nome: string; membros: string[] }[] {
  return equipes.filter((e) => e.ativa).map((e) => ({ id: e.id, nome: e.nome, membros: [...e.membros] }));
}
const pessoa = (id: string): PessoaUsuario => {
  const u = dbPortal.users.find((x) => x.id === id);
  return { id, nome: u?.name ?? id, email: u?.email ?? "" };
};
const exigir = () => requireAnyPermission(["manage_users_equipes", "manage_users"]);
const esperar = () => new Promise((r) => setTimeout(r, 200));

const mockEquipes: EquipesService = {
  async lista() {
    await esperar();
    exigir();
    return equipes
      .map((e) => ({
        id: e.id, nome: e.nome, setorId: e.setorId, setorNome: SETORES.find((s) => s.id === e.setorId)?.nome ?? null, descricao: e.descricao, ativa: e.ativa,
        lider: e.liderId ? pessoa(e.liderId) : null, membros: e.membros.map(pessoa).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      }))
      .sort((a, b) => Number(b.ativa) - Number(a.ativa) || (a.setorNome ?? "~").localeCompare(b.setorNome ?? "~", "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));
  },
  async candidatos() {
    exigir();
    return dbPortal.users.filter((u) => u.status === "active").map((u) => ({ id: u.id, nome: u.name, email: u.email })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  },
  async setores() {
    return SETORES;
  },
  async salvar(p) {
    await esperar();
    exigir();
    const nome = p.nome.trim();
    if (nome.length < 2 || nome.length > 60) throw new ServiceError("INVALID_INPUT", "Informe o nome da equipe (2 a 60 letras).", "nome");
    if (equipes.some((e) => e.id !== p.id && (e.setorId ?? 0) === (p.setorId ?? 0) && e.nome.toLowerCase() === nome.toLowerCase())) {
      throw new ServiceError("DUPLICATE", "Já existe uma equipe com esse nome neste setor.", "nome");
    }
    const membros = [...new Set([...p.membros, ...(p.liderId ? [p.liderId] : [])])];
    const dados = { nome, setorId: p.setorId, descricao: p.descricao.trim() || null, ativa: p.ativa, liderId: p.liderId, membros };
    const e = equipes.find((x) => x.id === p.id);
    if (e) Object.assign(e, dados);
    else equipes.push({ id: ++seq, ...dados });
    return e?.id ?? seq;
  },
  async excluir(id) {
    await esperar();
    exigir();
    const i = equipes.findIndex((e) => e.id === id);
    if (i < 0) throw new ServiceError("NOT_FOUND", "Equipe não encontrada.");
    equipes.splice(i, 1);
  },
  async doUsuario(usuarioId) {
    exigir();
    return equipes.filter((e) => e.membros.includes(usuarioId)).map((e) => e.id);
  },
  async salvarDoUsuario(usuarioId, ids) {
    await esperar();
    exigir();
    for (const e of equipes) {
      const tem = e.membros.includes(usuarioId);
      if (ids.includes(e.id) && !tem) e.membros.push(usuarioId);
      if (!ids.includes(e.id) && tem) {
        e.membros = e.membros.filter((m) => m !== usuarioId);
        if (e.liderId === usuarioId) e.liderId = null;
      }
    }
  },
};

export const equipesService: EquipesService = DATA_SOURCE === "mock" ? mockEquipes : supabaseEquipes;
