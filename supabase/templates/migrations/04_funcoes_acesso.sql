-- Modelo gerado a partir de calper-comercial/supabase/migrations/20260926180100_comercial_funcoes_acesso.sql.
-- __APP__ = schema do aplicativo; __APP_NAME__ = nome. Não aplique este arquivo: use `npm run novo-app`.

-- Fase 2 (2/4): funções de apoio às policies do __APP_NAME__.
--
-- SECURITY DEFINER + search_path vazio: leem `usuarios`/`profile_permissions` sem disparar a RLS
-- dessas tabelas (evita recursão) e sem risco de sequestro de search_path.
-- A regra é a mesma do front (policy.ts): super admin tem tudo; os demais, só o que estiver liberado.

create or replace function __APP__.perfil_usuario_atual()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.perfil_key
  from __APP__.usuarios u
  where u.id = (select auth.uid())
    and u.status <> 'inactive'
    and u.email like '%@calper.com.br';
$$;

comment on function __APP__.perfil_usuario_atual() is 'Perfil do usuário logado no portal; null se não for usuário ativo do portal.';

create or replace function __APP__.usuario_portal_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select __APP__.perfil_usuario_atual() is not null;
$$;

create or replace function __APP__.eh_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(__APP__.perfil_usuario_atual() = 'super_admin', false);
$$;

create or replace function __APP__.tem_permissao(p_permissao text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when __APP__.perfil_usuario_atual() is null then false
    when __APP__.perfil_usuario_atual() = 'super_admin' then true
    else exists (
      select 1
      from __APP__.profile_permissions pp
      where pp.role = __APP__.perfil_usuario_atual()
        and pp.permission_id = p_permissao
        and pp.enabled
    )
  end;
$$;

comment on function __APP__.tem_permissao(text) is 'Mesma regra do menuRegistry/policy.ts: super admin tem tudo; sem regra = negado.';

-- Só quem está logado usa as funções; o anon não executa nada.
revoke all on function __APP__.perfil_usuario_atual(), __APP__.usuario_portal_ativo(),
  __APP__.eh_super_admin(), __APP__.tem_permissao(text) from public, anon;
grant execute on function __APP__.perfil_usuario_atual(), __APP__.usuario_portal_ativo(),
  __APP__.eh_super_admin(), __APP__.tem_permissao(text) to authenticated, service_role;
