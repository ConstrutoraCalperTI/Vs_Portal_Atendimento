-- Modelo gerado a partir de calper-comercial/supabase/migrations/20260926200000_comercial_listar_perfis.sql.
-- __APP__ = schema do aplicativo; __APP_NAME__ = nome. Não aplique este arquivo: use `npm run novo-app`.

-- Fase 4: lista de perfis para as telas (Usuários e Perfis e permissões).
--
-- Contagens e "o que o usuário logado pode fazer em cada perfil" são calculados aqui, com as mesmas
-- funções de hierarquia das RPCs. Pela RLS de `usuarios`, quem não tem manage_users só enxerga a
-- própria linha, então contar do lado do front daria números errados.

create or replace function __APP__.listar_perfis()
returns table (
  key text,
  label text,
  description text,
  ordem integer,
  user_count integer,
  connected_count integer,
  locked boolean,
  assignable boolean,
  manageable boolean,
  can_place_below boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
begin
  if not (__APP__.tem_permissao_de(v_ator, 'manage_users') or __APP__.tem_permissao_de(v_ator, 'manage_permissions')) then
    perform __APP__.erro('FORBIDDEN', 'Você não tem permissão para esta ação.');
  end if;

  return query
    select
      p.key,
      p.label,
      p.description,
      p.ordem,
      (select count(*)::integer from __APP__.usuarios u where u.perfil_key = p.key),
      (select count(distinct s.user_id)::integer
         from auth.sessions s
         join __APP__.usuarios u on u.id = s.user_id
        where u.perfil_key = p.key and (s.not_after is null or s.not_after > now())),
      p.key = 'super_admin',
      __APP__.pode_atribuir(v_ator, p.key),
      __APP__.pode_gerenciar_perfil(v_ator, p.key),
      __APP__.pode_posicionar_abaixo(v_ator, p.key)
    from __APP__.perfis p
    order by p.ordem;
end;
$$;

revoke all on function __APP__.listar_perfis() from public, anon;
grant execute on function __APP__.listar_perfis() to authenticated, service_role;

notify pgrst, 'reload schema';
