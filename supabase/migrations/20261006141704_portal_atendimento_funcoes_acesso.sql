-- Modelo gerado a partir de calper-comercial/supabase/migrations/20260926180100_comercial_funcoes_acesso.sql.
-- portal_atendimento = schema do aplicativo; Portal Atendimento = nome. Não aplique este arquivo: use `npm run novo-app`.

-- Fase 2 (2/4): funções de apoio às policies do Portal Atendimento.
--
-- SECURITY DEFINER + search_path vazio: leem `usuarios`/`profile_permissions` sem disparar a RLS
-- dessas tabelas (evita recursão) e sem risco de sequestro de search_path.
-- A regra é a mesma do front (policy.ts): super admin tem tudo; os demais, só o que estiver liberado.

create or replace function portal_atendimento.perfil_usuario_atual()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.perfil_key
  from portal_atendimento.usuarios u
  where u.id = (select auth.uid())
    and u.status <> 'inactive'
    and u.email like '%@calper.com.br';
$$;

comment on function portal_atendimento.perfil_usuario_atual() is 'Perfil do usuário logado no portal; null se não for usuário ativo do portal.';

create or replace function portal_atendimento.usuario_portal_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select portal_atendimento.perfil_usuario_atual() is not null;
$$;

create or replace function portal_atendimento.eh_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(portal_atendimento.perfil_usuario_atual() = 'super_admin', false);
$$;

create or replace function portal_atendimento.tem_permissao(p_permissao text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when portal_atendimento.perfil_usuario_atual() is null then false
    when portal_atendimento.perfil_usuario_atual() = 'super_admin' then true
    else exists (
      select 1
      from portal_atendimento.profile_permissions pp
      where pp.role = portal_atendimento.perfil_usuario_atual()
        and pp.permission_id = p_permissao
        and pp.enabled
    )
  end;
$$;

comment on function portal_atendimento.tem_permissao(text) is 'Mesma regra do menuRegistry/policy.ts: super admin tem tudo; sem regra = negado.';

-- Só quem está logado usa as funções; o anon não executa nada.
revoke all on function portal_atendimento.perfil_usuario_atual(), portal_atendimento.usuario_portal_ativo(),
  portal_atendimento.eh_super_admin(), portal_atendimento.tem_permissao(text) from public, anon;
grant execute on function portal_atendimento.perfil_usuario_atual(), portal_atendimento.usuario_portal_ativo(),
  portal_atendimento.eh_super_admin(), portal_atendimento.tem_permissao(text) to authenticated, service_role;
