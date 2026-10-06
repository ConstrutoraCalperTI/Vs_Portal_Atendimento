-- Modelo gerado a partir de calper-comercial/supabase/migrations/20260926180300_comercial_seed_proprietario.sql.
-- portal_atendimento = schema do aplicativo; Portal Atendimento = nome. Não aplique este arquivo: use `npm run novo-app`.

-- Fase 2 (4/4): dono do portal e permissões padrão dos perfis.
--
-- O proprietário é a conta wagner.antunes@calper.com.br, que já existe no auth.users compartilhado.
-- Se a conta não existir, nada é inserido (o insert ... select não encontra linha).

insert into portal_atendimento.usuarios (id, email, nome, perfil_key, status, is_owner, last_access_at)
select u.id, lower(u.email), 'Wagner Antunes', 'super_admin', 'active', true, u.last_sign_in_at
from auth.users u
where lower(u.email) = 'wagner.antunes@calper.com.br'
on conflict (id) do nothing;

-- Permissões padrão (as mesmas do modo simulado). Super admin não tem linhas: tem acesso total.
-- configure_integrations e manage_app_access são só do super admin.
insert into portal_atendimento.profile_permissions (role, permission_id, enabled)
select role, permission_id, enabled
from (values
  ('admin', 'modulo_exemplo', true), ('admin', 'modulo_exemplo_lista', true), ('admin', 'modulo_exemplo_exportar', true),
  ('admin', 'manage_users', true), ('admin', 'manage_permissions', true),
  ('admin', 'view_audit_logs', true), ('admin', 'manage_sessions', true),

  ('ti', 'modulo_exemplo', true), ('ti', 'modulo_exemplo_lista', true),
  ('ti', 'manage_users', false), ('ti', 'manage_permissions', false),
  ('ti', 'view_audit_logs', true), ('ti', 'manage_sessions', true),

  ('financeiro', 'modulo_exemplo', true), ('financeiro', 'modulo_exemplo_lista', true),
  ('financeiro', 'manage_users', false), ('financeiro', 'manage_permissions', false),
  ('financeiro', 'view_audit_logs', false), ('financeiro', 'manage_sessions', false),

  ('operador', 'modulo_exemplo', true),
  ('operador', 'manage_users', false), ('operador', 'manage_permissions', false),
  ('operador', 'view_audit_logs', false), ('operador', 'manage_sessions', false)
) as padrao (role, permission_id, enabled)
on conflict (role, permission_id) do nothing;

notify pgrst, 'reload schema';
