/** Empresa e nome do sistema: cabeçalho da sidebar, topo, título da aba e login. */
export const COMPANY_NAME = "Calper Construtora";
export const APP_NAME = "Portal Atendimento";

/**
 * Schema do aplicativo no Supabase compartilhado da Calper. É também a chave dele na tela
 * Permissões por aplicativo e o prefixo das Edge Functions (<schema>-usuarios, <schema>-totvs…).
 * Projeto novo: troque aqui (ou em VITE_APP_SCHEMA) e gere o backend com `npm run novo-app -- <schema>`.
 */
export const APP_SCHEMA: string = (import.meta.env.VITE_APP_SCHEMA ?? "").trim() || "portal_atendimento";

/** Nome publicado de uma Edge Function do aplicativo, ex.: edgeFunction("usuarios") → "modelo-usuarios". */
export function edgeFunction(name: "usuarios" | "totvs" | "integracao-teste" | "zenvia" | "atendimento" | "email"): string {
  return `${APP_SCHEMA}-${name}`;
}

/** Prefixo das chaves do navegador (localStorage/sessionStorage) deste aplicativo. */
export const STORAGE_PREFIX = `calper-${APP_SCHEMA}`;

/** Único domínio autorizado a entrar no portal. */
export const CORPORATE_DOMAIN = "calper.com.br";

/**
 * Chave de um perfil de acesso. Os perfis são cadastrados na tela Perfis e permissões
 * (a hierarquia vem do serviço); só as chaves abaixo têm significado fixo no código.
 */
export type RoleKey = string;

/** Perfil do sistema com acesso total. Não é editável nem pode ser excluído. */
export const SUPER_ADMIN_ROLE: RoleKey = "super_admin";

/** Perfis que podem criar, editar e excluir outros perfis. */
export const ROLE_MANAGER_ROLES: readonly RoleKey[] = [SUPER_ADMIN_ROLE, "admin"];

/**
 * Só e-mails @calper.com.br entram no portal. No front serve para orientar o usuário;
 * quem bloqueia de verdade é o serviço (e, no Supabase, a Edge Function/RLS do portal).
 */
export function isAllowedLoginEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${CORPORATE_DOMAIN}`);
}
