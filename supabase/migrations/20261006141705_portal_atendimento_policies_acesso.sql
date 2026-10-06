-- Modelo gerado a partir de calper-comercial/supabase/migrations/20260926180200_comercial_policies_acesso.sql.
-- portal_atendimento = schema do aplicativo; Portal Atendimento = nome. Não aplique este arquivo: use `npm run novo-app`.

-- Fase 2 (3/4): RLS das tabelas de acesso do Portal Atendimento + correções de segurança aprovadas.
--
-- Regra geral: só usuário ativo do portal (e-mail @calper.com.br) lê; escrita só por RPC/Edge
-- Function (fase 3), nunca direto do front. O projeto é compartilhado: "authenticated" inclui
-- usuários de outros sistemas, por isso nenhuma policy aqui usa só `auth.uid() is not null`.
--
-- Policies antigas removidas (para desfazer, recrie com o SQL comentado ao lado):
--   profile_permissions  "Authenticated can select profile_permissions"  SELECT  (qualquer logado)
--   profile_permissions  "Auth insert perms"   INSERT  with check has_role(auth.uid(), 'super_admin')
--   profile_permissions  "Auth update perms"   UPDATE  using has_role(auth.uid(), 'super_admin')
--   user_roles           "Authenticated can select user_roles"  SELECT  (qualquer logado)
--   integration_settings "Authenticated can select integration_settings"  SELECT  (qualquer logado)
--   integration_settings "Auth insert integration"  INSERT  with check auth.uid() is not null
--   integration_settings "Auth update integration"  UPDATE  using auth.uid() is not null

-- ---------- Tabelas novas ----------

alter table portal_atendimento.perfis enable row level security;
alter table portal_atendimento.usuarios enable row level security;
alter table portal_atendimento.integracoes enable row level security;

drop policy if exists "Portal: usuários ativos leem perfis" on portal_atendimento.perfis;
create policy "Portal: usuários ativos leem perfis"
  on portal_atendimento.perfis for select to authenticated
  using ((select portal_atendimento.usuario_portal_ativo()));

drop policy if exists "Portal: próprio registro ou gestão de usuários" on portal_atendimento.usuarios;
create policy "Portal: próprio registro ou gestão de usuários"
  on portal_atendimento.usuarios for select to authenticated
  using (id = (select auth.uid()) or (select portal_atendimento.tem_permissao('manage_users')));

drop policy if exists "Portal: integrações só para super admin" on portal_atendimento.integracoes;
create policy "Portal: integrações só para super admin"
  on portal_atendimento.integracoes for select to authenticated
  using ((select portal_atendimento.eh_super_admin()));

-- ---------- profile_permissions: leitura só do portal, escrita só por RPC ----------

drop policy if exists "Authenticated can select profile_permissions" on portal_atendimento.profile_permissions;
drop policy if exists "Auth insert perms" on portal_atendimento.profile_permissions;
drop policy if exists "Auth update perms" on portal_atendimento.profile_permissions;

drop policy if exists "Portal: usuários ativos leem permissões" on portal_atendimento.profile_permissions;
create policy "Portal: usuários ativos leem permissões"
  on portal_atendimento.profile_permissions for select to authenticated
  using ((select portal_atendimento.usuario_portal_ativo()));

revoke insert, update, delete, truncate on portal_atendimento.profile_permissions from authenticated;

-- ---------- user_roles (legado): cada um vê só o próprio papel ----------

drop policy if exists "Authenticated can select user_roles" on portal_atendimento.user_roles;

-- ---------- integration_settings (legado): senha em texto puro fora do alcance do front ----------

drop policy if exists "Authenticated can select integration_settings" on portal_atendimento.integration_settings;
drop policy if exists "Auth insert integration" on portal_atendimento.integration_settings;
drop policy if exists "Auth update integration" on portal_atendimento.integration_settings;

drop policy if exists "Portal: integration_settings só para super admin" on portal_atendimento.integration_settings;
create policy "Portal: integration_settings só para super admin"
  on portal_atendimento.integration_settings for select to authenticated
  using ((select portal_atendimento.eh_super_admin()));

revoke all on portal_atendimento.integration_settings from authenticated;
-- A coluna api_password nunca é legível pelo front.
grant select (id, name, api_base_url, api_user, is_active, created_by, created_at, updated_at)
  on portal_atendimento.integration_settings to authenticated;

-- ---------- audit_logs: somente leitura para quem tem a permissão (regra 10) ----------

drop policy if exists "Portal: auditoria para quem tem permissão" on portal_atendimento.audit_logs;
create policy "Portal: auditoria para quem tem permissão"
  on portal_atendimento.audit_logs for select to authenticated
  using ((select portal_atendimento.tem_permissao('view_audit_logs')));

revoke insert, update, delete, truncate on portal_atendimento.audit_logs from authenticated;
