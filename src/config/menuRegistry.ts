import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  Building2,
  Contact,
  Eye,
  FolderTree,
  FormInput,
  Layers,
  FileText,
  Gauge,
  Home,
  LayoutDashboard,
  ListChecks,
  Link,
  Mail,
  MessageCircle,
  MessagesSquare,
  Monitor,
  Settings,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  SquareKanban,
  Ticket,
  Users,
  UsersRound,
} from "lucide-react";

// Fonte única de menu, rotas e permissões. Sidebar, guard de rotas e matriz de
// permissões leem apenas daqui: para criar um menu novo, basta
// adicionar uma entrada nesta lista.
//
// Dois níveis:
// - Item com `parent` é uma SEÇÃO dentro da tela do pai (rota própria, fora da sidebar). O pai
//   aparece para quem tiver o próprio item ou qualquer seção dele.
// - Ação (`actionDefinitions`) não tem rota: libera um botão dentro de uma tela e só vale junto
//   com a permissão do pai.

export type MenuGroup = "principal" | "configuracoes";

interface MenuItemDefinition {
  /** Identificador da permissão que libera o item. */
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  group: MenuGroup;
  /** Texto de apoio usado nos cards e cabeçalhos. */
  description?: string;
  /** Só o super admin acessa, mesmo que o perfil tenha a permissão. */
  superAdminOnly?: boolean;
  /** Regra fixa: só o perfil Admin e o super admin acessam (não é marcável em Perfis e permissões). */
  adminOnly?: boolean;
  /** Só o Super admin da Central de acessos da Calper (super_admin do Gestão Comercial). */
  centralOnly?: boolean;
  /** Sempre visível, sem depender de permissão. */
  alwaysVisible?: boolean;
  /** Seção dentro da tela de outro item (id do pai). */
  parent?: string;
  /** A tela tem abas internas próprias (rota "/*"), mesmo sem seções registradas. */
  subroutes?: boolean;
}

interface ActionPermissionDefinition {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Item ao qual a ação pertence; sem ele, a ação não vale. */
  parent: string;
}

const definitions = [
  { id: "home", label: "Página Inicial", path: "/home", icon: Home, group: "principal", alwaysVisible: true },
  {
    id: "gestao_chamados",
    label: "Gestão de Chamados",
    path: "/gestao-chamados",
    icon: Ticket,
    group: "principal",
    description: "Fila de tickets, prazos de SLA e distribuição por equipe.",
  },
  {
    id: "gestao_chamados_visao_geral",
    label: "Visão geral",
    path: "/gestao-chamados/visao-geral",
    icon: LayoutDashboard,
    group: "principal",
    description: "Painel da operação: KPIs, fila do que precisa de ação, triagem e SLA.",
    parent: "gestao_chamados",
  },
  {
    id: "gestao_chamados_tickets",
    label: "Tickets",
    path: "/gestao-chamados/tickets",
    icon: SquareKanban,
    group: "principal",
    description: "Tickets em Kanban ou Lista, conforme as visões da sua equipe.",
    parent: "gestao_chamados",
  },
  {
    id: "gestao_chamados_status",
    label: "Status",
    path: "/gestao-chamados/status",
    icon: ListChecks,
    group: "principal",
    description: "Cadastro dos status de ticket e das justificativas de cada um.",
    parent: "gestao_chamados",
    adminOnly: true,
  },
  {
    id: "gestao_atendimento",
    label: "Administração",
    path: "/gestao-atendimento",
    icon: MessagesSquare,
    group: "principal",
    description: "Atendimento por WhatsApp e e-mail, separado por setor.",
  },
  {
    id: "gestao_atendimento_central",
    label: "Central de atendimento",
    path: "/gestao-atendimento/central",
    icon: MessageCircle,
    group: "principal",
    description: "Fila, conversas e chat do seu setor. Gestores veem também o Monitor.",
    parent: "gestao_atendimento",
  },
  {
    id: "gestao_atendimento_fila",
    label: "Fila e horários",
    path: "/gestao-atendimento/fila",
    icon: UsersRound,
    group: "principal",
    description: "Equipe, horário, mensagens automáticas e regras da fila de cada setor.",
    parent: "gestao_atendimento",
  },
  {
    id: "gestao_atendimento_setores",
    label: "Setores e números",
    path: "/gestao-atendimento/setores",
    icon: Building2,
    group: "principal",
    description: "Setores de atendimento, os números de WhatsApp de cada um e o gestor.",
    parent: "gestao_atendimento",
  },
  {
    id: "gestao_atendimento_emails",
    label: "Central Email",
    path: "/gestao-atendimento/emails",
    icon: Mail,
    group: "principal",
    description: "Central Email: contas de e-mail (autorizadas no Google, uma a uma) que recebem os chamados e enviam as respostas de cada setor.",
    parent: "gestao_atendimento",
  },
  // Cadastros do processo de ticket (estrutura da Movidesk). Configuração: só Admin e Super admin.
  {
    id: "gestao_atendimento_servicos",
    label: "Serviços",
    path: "/gestao-atendimento/servicos",
    icon: Layers,
    group: "principal",
    description: "Catálogo de serviços: o que se pode pedir em cada setor, a equipe responsável e o prazo de SLA.",
    parent: "gestao_atendimento",
    adminOnly: true,
  },
  {
    id: "gestao_atendimento_urgencias",
    label: "Urgências",
    path: "/gestao-atendimento/urgencias",
    icon: Siren,
    group: "principal",
    description: "Níveis de urgência do ticket e o efeito de cada um no prazo de SLA.",
    parent: "gestao_atendimento",
    adminOnly: true,
  },
  {
    id: "gestao_atendimento_categorias",
    label: "Categorias",
    path: "/gestao-atendimento/categorias",
    icon: FolderTree,
    group: "principal",
    description: "Tipos de ticket (dúvida, problema, solicitação…), usados em relatórios, visões e regras.",
    parent: "gestao_atendimento",
    adminOnly: true,
  },
  {
    id: "gestao_atendimento_campos",
    label: "Campos adicionais",
    path: "/gestao-atendimento/campos-adicionais",
    icon: FormInput,
    group: "principal",
    description: "Campos próprios do ticket (ex.: PROTOCOLO, obra, unidade), com tipo e obrigatoriedade.",
    parent: "gestao_atendimento",
    adminOnly: true,
  },
  {
    id: "gestao_atendimento_regras_exibicao",
    label: "Regras para exibição",
    path: "/gestao-atendimento/regras-exibicao",
    icon: SlidersHorizontal,
    group: "principal",
    description: "Quando cada campo adicional aparece, fica obrigatório ou some, conforme serviço, categoria e outros campos.",
    parent: "gestao_atendimento",
    adminOnly: true,
  },
  {
    id: "manage_users",
    label: "Usuários",
    path: "/configuracoes/usuarios",
    icon: Users,
    group: "configuracoes",
    description: "Quem pode entrar no sistema e com qual perfil.",
  },
  {
    id: "manage_users_equipes",
    label: "Equipes",
    path: "/configuracoes/usuarios/equipes",
    icon: UsersRound,
    group: "configuracoes",
    description: "Grupos de atendentes dentro de um setor; o usuário pode estar em várias equipes.",
    parent: "manage_users",
  },
  {
    id: "manage_pessoas",
    label: "Pessoas",
    path: "/configuracoes/pessoas",
    icon: Contact,
    group: "configuracoes",
    description: "Quem abre chamados: clientes, empresas e departamentos. Criadas sozinhas no primeiro e-mail ou WhatsApp, ou cadastradas à mão.",
  },
  {
    id: "manage_permissions",
    label: "Perfis e permissões",
    path: "/configuracoes/perfis",
    icon: ShieldCheck,
    group: "configuracoes",
    description: "Defina quais menus cada perfil de acesso enxerga.",
  },
  {
    id: "manage_app_access",
    label: "Permissões por aplicativo",
    path: "/configuracoes/permissoes-aplicativo",
    icon: AppWindow,
    group: "configuracoes",
    description: "Quem pode entrar em cada aplicativo da Calper (um por schema do Supabase).",
    superAdminOnly: true,
    centralOnly: true,
  },
  {
    id: "configure_integrations",
    label: "Integrações",
    path: "/configuracoes/integracoes",
    icon: Link,
    group: "configuracoes",
    description: "Conexão TOTVS RM, consultas SQL, Zenvia WhatsApp e Google Workspace.",
    superAdminOnly: true,
    subroutes: true,
  },
  {
    id: "atendimento_zenvia",
    label: "Zenvia WhatsApp",
    path: "/configuracoes/integracoes/zenvia",
    icon: MessageCircle,
    group: "configuracoes",
    description: "Conta Zenvia (token e webhooks) dos números da Administração.",
    superAdminOnly: true,
    parent: "configure_integrations",
  },
  {
    id: "view_audit_logs",
    label: "Auditoria",
    path: "/configuracoes/auditoria",
    icon: FileText,
    group: "configuracoes",
    description: "Histórico de quem alterou o quê, com antes e depois.",
  },
  {
    id: "manage_sessions",
    label: "Sessões ativas",
    path: "/configuracoes/sessoes",
    icon: Monitor,
    group: "configuracoes",
    description: "Quem está conectado agora e encerramento de sessões.",
  },
] as const satisfies readonly MenuItemDefinition[];

const actionDefinitions = [
  {
    id: "gestao_atendimento_monitor",
    label: "Monitor e gestão do setor",
    description: "Vê o Monitor, transfere conversas e configura a fila, mas só nos setores em que a pessoa é gestora (Setores e números).",
    icon: Gauge,
    parent: "gestao_atendimento_central",
  },
  {
    id: "gestao_atendimento_supervisao",
    label: "Supervisão geral do atendimento",
    description: "Vê e gerencia todos os setores: conversas, Monitor, fila e horários.",
    icon: Eye,
    parent: "gestao_atendimento_central",
  },
] as const satisfies readonly ActionPermissionDefinition[];

type Definition = (typeof definitions)[number];

export type MenuItemId = Definition["id"];
export type ActionPermissionId = (typeof actionDefinitions)[number]["id"];
export type PermissionId = MenuItemId | ActionPermissionId;
/** Itens com tela própria no roteador (sem `parent`). */
export type TopLevelMenuId = Exclude<Definition, { parent: string }>["id"];

export type MenuItem = Omit<MenuItemDefinition, "id" | "parent"> & { id: MenuItemId; parent?: MenuItemId };

/** Entrada da matriz de permissões: item de menu ou ação. */
export interface PermissionEntry {
  id: PermissionId;
  kind: "menu" | "action";
  label: string;
  description?: string;
  icon: LucideIcon;
  group: MenuGroup;
  parent?: PermissionId;
  superAdminOnly?: boolean;
  adminOnly?: boolean;
  alwaysVisible?: boolean;
}

export const menuRegistry: readonly MenuItem[] = definitions;

export const CONFIG_ROOT_PATH = "/configuracoes";

export const menuGroups: Record<MenuGroup, { label: string; icon: LucideIcon }> = {
  principal: { label: "Menu principal", icon: Home },
  configuracoes: { label: "Configurações", icon: Settings },
};

const itemsById = new Map<MenuItemId, MenuItem>(menuRegistry.map((item) => [item.id, item]));

export function getMenuItem(id: MenuItemId): MenuItem {
  const item = itemsById.get(id);
  if (!item) throw new Error(`Item de menu não registrado: ${id}`);
  return item;
}

/** Todas as permissões (menus e ações), cada ação com o grupo do item pai. */
export const permissionEntries: readonly PermissionEntry[] = [
  ...menuRegistry.map((item): PermissionEntry => ({ ...item, kind: "menu" })),
  ...actionDefinitions.map(
    (action): PermissionEntry => ({ ...action, kind: "action", group: getMenuItem(action.parent).group }),
  ),
];

const entriesById = new Map<PermissionId, PermissionEntry>(permissionEntries.map((entry) => [entry.id, entry]));

export function getPermission(id: PermissionId): PermissionEntry {
  const entry = entriesById.get(id);
  if (!entry) throw new Error(`Permissão não registrada: ${id}`);
  return entry;
}

export function isPermissionId(value: string): value is PermissionId {
  return entriesById.has(value as PermissionId);
}

/** Itens de primeiro nível do grupo (sidebar, cards e matriz). */
export function menuItemsByGroup(group: MenuGroup): MenuItem[] {
  return menuRegistry.filter((item) => item.group === group && !item.parent);
}

/** Seções (com rota) dentro da tela de um item. */
export function routeChildrenOf(id: MenuItemId): MenuItem[] {
  return menuRegistry.filter((item) => item.parent === id);
}

/** Tudo o que fica aninhado sob uma permissão na matriz: seções e ações. */
export function permissionChildrenOf(id: PermissionId): PermissionEntry[] {
  return permissionEntries.filter((entry) => entry.parent === id);
}

export type RouteRequirement =
  | { type: "permission"; id: PermissionId }
  | { type: "anyOf"; ids: PermissionId[] }
  | { type: "anyInGroup"; group: MenuGroup }
  | { type: "open" };

/**
 * Descobre qual permissão protege uma rota (o caminho mais específico vence).
 * A raiz de um item com seções abre para quem tiver o item ou qualquer seção.
 * Rotas fora do registro ficam abertas (ex.: 404).
 */
export function resolvePermissionForPath(pathname: string): RouteRequirement {
  const path = pathname.replace(/\/+$/, "") || "/";
  const item = menuRegistry
    .filter((entry) => path === entry.path || path.startsWith(`${entry.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (item) {
    const sections = routeChildrenOf(item.id);
    if (path === item.path && sections.length > 0) {
      return { type: "anyOf", ids: [item.id, ...sections.map((section) => section.id)] };
    }
    return { type: "permission", id: item.id };
  }
  if (path === CONFIG_ROOT_PATH) return { type: "anyInGroup", group: "configuracoes" };
  return { type: "open" };
}
