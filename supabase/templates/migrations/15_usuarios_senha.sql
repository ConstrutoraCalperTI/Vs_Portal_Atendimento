-- Modelo gerado a partir de calper-comercial/supabase/migrations/20260928130000_comercial_usuarios_senha.sql.
-- __APP__ = schema do aplicativo; __APP_NAME__ = nome. Não aplique este arquivo: use `npm run novo-app`.

-- Senha de outro usuário pela tela de Usuários (aditiva: só cria funções).
--  - exigir_troca_senha: liga/desliga a troca obrigatória no próximo login, sem mexer na senha.
--  - preparar_senha_temporaria / registrar_senha_temporaria: usadas só pela Edge Function
--    __APP__-usuarios (ação "set_password"), que troca a senha pela API de admin do Auth.
--    O login é compartilhado com os outros sistemas da Calper: a senha temporária vale em todos.
-- As três passam por carregar_alvo_usuario: permissão manage_users, proprietário protegido,
-- super admin só por super admin e nunca a própria conta.

create or replace function __APP__.exigir_troca_senha(p_id uuid, p_exigir boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_alvo __APP__.usuarios := __APP__.carregar_alvo_usuario(
    v_ator, p_id, 'Para a sua própria conta, use “Alterar senha”.');
begin
  if v_alvo.must_change_password = p_exigir then
    return;
  end if;
  update __APP__.usuarios set must_change_password = p_exigir where id = p_id;
  perform __APP__.registrar_auditoria(v_ator, 'usuarios', 'update',
    case when p_exigir
      then format('Troca de senha exigida no próximo login de %s', v_alvo.nome)
      else format('Exigência de troca de senha removida de %s', v_alvo.nome)
    end,
    jsonb_build_object('must_change_password', v_alvo.must_change_password),
    jsonb_build_object('must_change_password', p_exigir),
    p_id::text);
end;
$$;

-- Confere as regras antes de a Edge tocar no Auth; devolve o e-mail do alvo.
create or replace function __APP__.preparar_senha_temporaria(p_ator uuid, p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_alvo __APP__.usuarios := __APP__.carregar_alvo_usuario(
    p_ator, p_id, 'Para a sua própria conta, use “Alterar senha”.');
begin
  if not exists (select 1 from auth.users a where a.id = p_id) then
    perform __APP__.erro('NOT_FOUND', 'A conta de login deste usuário não foi encontrada.');
  end if;
  return v_alvo.email;
end;
$$;

-- Depois que a Edge trocou a senha: troca obrigatória no próximo login + auditoria.
create or replace function __APP__.registrar_senha_temporaria(p_ator uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alvo __APP__.usuarios := __APP__.carregar_alvo_usuario(p_ator, p_id, null);
begin
  update __APP__.usuarios set must_change_password = true where id = p_id;
  perform __APP__.registrar_auditoria(p_ator, 'usuarios', 'password_reset',
    format('Senha temporária definida para %s (troca obrigatória no próximo login)', v_alvo.nome),
    null, jsonb_build_object('must_change_password', true), p_id::text);
end;
$$;

revoke all on function
  __APP__.exigir_troca_senha(uuid, boolean),
  __APP__.preparar_senha_temporaria(uuid, uuid),
  __APP__.registrar_senha_temporaria(uuid, uuid)
from public, anon;

grant execute on function __APP__.exigir_troca_senha(uuid, boolean) to authenticated, service_role;

-- Recebem o ator como parâmetro: só a Edge (service_role) pode chamar.
revoke execute on function
  __APP__.preparar_senha_temporaria(uuid, uuid),
  __APP__.registrar_senha_temporaria(uuid, uuid)
from authenticated;
grant execute on function
  __APP__.preparar_senha_temporaria(uuid, uuid),
  __APP__.registrar_senha_temporaria(uuid, uuid)
to service_role;
