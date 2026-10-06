-- Modelo gerado a partir de calper-comercial/supabase/migrations/20260926190100_comercial_rpcs_portal.sql.
-- portal_atendimento = schema do aplicativo; Portal Atendimento = nome. Não aplique este arquivo: use `npm run novo-app`.

-- Fase 3 (2/3): RPCs chamadas pelo front do Portal Atendimento (papel authenticated).
--
-- Cada RPC: confere a permissão de quem chama (auth.uid()), aplica as regras do portal (as mesmas
-- do mock), grava e registra a auditoria na mesma transação. O front não escreve direto em tabela.

-- ============================================================================================
-- Permissões por perfil (regras 7 e 8)
-- ============================================================================================

-- p_alteracoes: [{"id": "modulo_2", "enabled": true, "label": "Módulo 2"}, ...]  (label só para a auditoria)
create or replace function portal_atendimento.salvar_permissoes_perfil(p_perfil text, p_alteracoes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_label text := (select p.label from portal_atendimento.perfis p where p.key = p_perfil);
  v_item record;
  v_anterior boolean;
begin
  if not portal_atendimento.tem_permissao_de(v_ator, 'manage_permissions') then
    perform portal_atendimento.erro('FORBIDDEN', 'Você não tem permissão para esta ação.');
  end if;
  if v_label is null then
    perform portal_atendimento.erro('NOT_FOUND', 'Perfil não encontrado.');
  end if;
  if p_perfil = 'super_admin' then
    perform portal_atendimento.erro('LOCKED_PERMISSION', 'O perfil Super admin tem acesso total e não é editável.');
  end if;
  if jsonb_typeof(p_alteracoes) <> 'array' then
    perform portal_atendimento.erro('INVALID_INPUT', 'Lista de alterações inválida.');
  end if;

  -- Valida o lote inteiro antes de gravar: ou salva tudo, ou nada.
  for v_item in select * from jsonb_to_recordset(p_alteracoes) as x(id text, enabled boolean, label text) loop
    if v_item.id is null or v_item.id !~ '^[a-z0-9_]{2,60}$' or v_item.enabled is null then
      perform portal_atendimento.erro('INVALID_INPUT', 'Lista de alterações inválida.');
    end if;
    -- Espelha o menuRegistry: "home" é sempre visível e "configure_integrations" é só do super admin.
    if v_item.id in ('home', 'configure_integrations') then
      perform portal_atendimento.erro('LOCKED_PERMISSION', format('O menu %s não pode ser alterado por perfil.', coalesce(v_item.label, v_item.id)));
    end if;
  end loop;

  for v_item in select * from jsonb_to_recordset(p_alteracoes) as x(id text, enabled boolean, label text) loop
    v_anterior := (select pp.enabled from portal_atendimento.profile_permissions pp where pp.role = p_perfil and pp.permission_id = v_item.id);
    continue when v_anterior is not distinct from v_item.enabled;

    insert into portal_atendimento.profile_permissions (role, permission_id, enabled)
    values (p_perfil, v_item.id, v_item.enabled)
    on conflict (role, permission_id) do update set enabled = excluded.enabled, updated_at = now();

    perform portal_atendimento.registrar_auditoria(
      v_ator, 'permissoes', 'permission',
      format('Perfil %s: %s %s', v_label, coalesce(v_item.label, v_item.id), case when v_item.enabled then 'liberado' else 'negado' end),
      jsonb_build_object('enabled', v_anterior), jsonb_build_object('enabled', v_item.enabled), p_perfil
    );
  end loop;
end;
$$;

-- ============================================================================================
-- Cadastro de perfis
-- ============================================================================================

create or replace function portal_atendimento.criar_perfil(p_label text, p_descricao text, p_abaixo_de text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_label text := trim(coalesce(p_label, ''));
  v_descricao text := trim(coalesce(p_descricao, ''));
  v_chave text;
  v_ordem integer;
begin
  if not portal_atendimento.eh_gestor_perfis(v_ator) then
    perform portal_atendimento.erro('FORBIDDEN', 'Somente Super admin e Admin podem cadastrar perfis.');
  end if;
  if length(v_label) not between 2 and 40 then
    perform portal_atendimento.erro('INVALID_INPUT', 'O nome precisa ter entre 2 e 40 caracteres.', 'label');
  end if;
  if length(v_descricao) > 120 then
    perform portal_atendimento.erro('INVALID_INPUT', 'Use no máximo 120 caracteres.', 'description');
  end if;
  if exists (select 1 from portal_atendimento.perfis p where lower(p.label) = lower(v_label)) then
    perform portal_atendimento.erro('ROLE_EXISTS', 'Já existe um perfil com este nome.', 'label');
  end if;
  if not portal_atendimento.pode_posicionar_abaixo(v_ator, p_abaixo_de) then
    perform portal_atendimento.erro('ROLE_NOT_ALLOWED', 'Escolha uma posição no seu nível ou abaixo dele.', 'placeAfter');
  end if;

  v_chave := portal_atendimento.gerar_chave_perfil(v_label);
  v_ordem := portal_atendimento.nivel_perfil(p_abaixo_de) + 1;
  -- Abre espaço na hierarquia (a unicidade de "ordem" é conferida só no fim da transação).
  update portal_atendimento.perfis set ordem = ordem + 1 where ordem >= v_ordem;
  insert into portal_atendimento.perfis (key, label, description, ordem, created_by)
  values (v_chave, v_label, v_descricao, v_ordem, v_ator);

  perform portal_atendimento.registrar_auditoria(
    v_ator, 'permissoes', 'create', format('Perfil %s criado', v_label),
    null, jsonb_build_object('key', v_chave, 'label', v_label, 'abaixo_de', p_abaixo_de), v_chave
  );
  return v_chave;
end;
$$;

create or replace function portal_atendimento.editar_perfil(p_key text, p_label text, p_descricao text, p_abaixo_de text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_atual portal_atendimento.perfis;
  v_label text := trim(coalesce(p_label, ''));
  v_descricao text := trim(coalesce(p_descricao, ''));
  v_acima text;
  v_nova_ordem integer;
  v_antes jsonb := '{}'::jsonb;
  v_depois jsonb := '{}'::jsonb;
begin
  select * into v_atual from portal_atendimento.perfis p where p.key = p_key;
  if v_atual.key is null then
    perform portal_atendimento.erro('NOT_FOUND', 'Perfil não encontrado.');
  end if;
  if not portal_atendimento.pode_gerenciar_perfil(v_ator, p_key) then
    perform portal_atendimento.erro('FORBIDDEN', case when p_key = 'super_admin'
      then 'O perfil Super admin não pode ser alterado.'
      else 'Você só pode alterar perfis abaixo do seu na hierarquia.' end);
  end if;
  if length(v_label) not between 2 and 40 then
    perform portal_atendimento.erro('INVALID_INPUT', 'O nome precisa ter entre 2 e 40 caracteres.', 'label');
  end if;
  if length(v_descricao) > 120 then
    perform portal_atendimento.erro('INVALID_INPUT', 'Use no máximo 120 caracteres.', 'description');
  end if;
  if exists (select 1 from portal_atendimento.perfis p where lower(p.label) = lower(v_label) and p.key <> p_key) then
    perform portal_atendimento.erro('ROLE_EXISTS', 'Já existe um perfil com este nome.', 'label');
  end if;
  if p_abaixo_de = p_key or not portal_atendimento.pode_posicionar_abaixo(v_ator, p_abaixo_de) then
    perform portal_atendimento.erro('ROLE_NOT_ALLOWED', 'Escolha uma posição no seu nível ou abaixo dele.', 'placeAfter');
  end if;

  v_acima := (select p.key from portal_atendimento.perfis p where p.ordem < v_atual.ordem order by p.ordem desc limit 1);
  if p_abaixo_de is distinct from v_acima then
    -- Tira da posição atual, fecha o buraco e reabre logo abaixo do perfil escolhido.
    update portal_atendimento.perfis set ordem = ordem - 1 where ordem > v_atual.ordem;
    v_nova_ordem := portal_atendimento.nivel_perfil(p_abaixo_de) + 1;
    update portal_atendimento.perfis set ordem = ordem + 1 where ordem >= v_nova_ordem and key <> p_key;
    update portal_atendimento.perfis set ordem = v_nova_ordem where key = p_key;
    v_antes := v_antes || jsonb_build_object('abaixo_de', v_acima);
    v_depois := v_depois || jsonb_build_object('abaixo_de', p_abaixo_de);
  end if;

  if v_label <> v_atual.label then
    v_antes := v_antes || jsonb_build_object('label', v_atual.label);
    v_depois := v_depois || jsonb_build_object('label', v_label);
  end if;
  if v_descricao <> v_atual.description then
    v_antes := v_antes || jsonb_build_object('description', v_atual.description);
    v_depois := v_depois || jsonb_build_object('description', v_descricao);
  end if;

  update portal_atendimento.perfis set label = v_label, description = v_descricao where key = p_key;

  if v_depois <> '{}'::jsonb then
    perform portal_atendimento.registrar_auditoria(v_ator, 'permissoes', 'update', format('Perfil %s alterado', v_label), v_antes, v_depois, p_key);
  end if;
end;
$$;

create or replace function portal_atendimento.excluir_perfil(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_atual portal_atendimento.perfis;
  v_membros integer;
begin
  select * into v_atual from portal_atendimento.perfis p where p.key = p_key;
  if v_atual.key is null then
    perform portal_atendimento.erro('NOT_FOUND', 'Perfil não encontrado.');
  end if;
  if not portal_atendimento.pode_gerenciar_perfil(v_ator, p_key) then
    perform portal_atendimento.erro('FORBIDDEN', 'Você só pode excluir perfis abaixo do seu na hierarquia.');
  end if;
  if v_atual.is_system then
    perform portal_atendimento.erro('FORBIDDEN', format('O perfil %s é do sistema e não pode ser excluído.', v_atual.label));
  end if;
  v_membros := (select count(*) from portal_atendimento.usuarios u where u.perfil_key = p_key);
  if v_membros > 0 then
    perform portal_atendimento.erro('ROLE_IN_USE', format('O perfil %s tem %s %s. Mude o perfil %s antes de excluir.',
      v_atual.label, v_membros, case when v_membros = 1 then 'usuário' else 'usuários' end,
      case when v_membros = 1 then 'dele' else 'deles' end));
  end if;

  delete from portal_atendimento.perfis where key = p_key;  -- as permissões saem junto (FK em cascata)
  update portal_atendimento.perfis set ordem = ordem - 1 where ordem > v_atual.ordem;

  perform portal_atendimento.registrar_auditoria(v_ator, 'permissoes', 'delete', format('Perfil %s excluído', v_atual.label),
    jsonb_build_object('key', v_atual.key, 'label', v_atual.label), null, p_key);
end;
$$;

-- ============================================================================================
-- Usuários (o que não precisa da API de administração do Auth)
-- ============================================================================================

/** Regras 4 e 5 + proprietário: ninguém mexe no dono, super admin só por super admin, ninguém em si mesmo. */
create or replace function portal_atendimento.carregar_alvo_usuario(p_ator uuid, p_alvo uuid, p_mensagem_propria text)
returns portal_atendimento.usuarios
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_alvo portal_atendimento.usuarios;
begin
  if not portal_atendimento.tem_permissao_de(p_ator, 'manage_users') then
    perform portal_atendimento.erro('FORBIDDEN', 'Você não tem permissão para esta ação.');
  end if;
  select * into v_alvo from portal_atendimento.usuarios u where u.id = p_alvo;
  if v_alvo.id is null then
    perform portal_atendimento.erro('NOT_FOUND', 'Usuário não encontrado.');
  end if;
  if v_alvo.is_owner and v_alvo.id <> p_ator then
    perform portal_atendimento.erro('PROTECTED_USER', 'A conta proprietária do portal não pode ser alterada por aqui.');
  end if;
  if v_alvo.perfil_key = 'super_admin' and portal_atendimento.perfil_de(p_ator) is distinct from 'super_admin' then
    perform portal_atendimento.erro('PROTECTED_USER', 'Somente um super admin pode alterar outro super admin.');
  end if;
  if p_mensagem_propria is not null and v_alvo.id = p_ator then
    perform portal_atendimento.erro('SELF_ACTION', p_mensagem_propria);
  end if;
  return v_alvo;
end;
$$;

create or replace function portal_atendimento.atualizar_usuario(p_id uuid, p_nome text, p_perfil text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_alvo portal_atendimento.usuarios := portal_atendimento.carregar_alvo_usuario(v_ator, p_id, null);
  v_nome text := trim(coalesce(p_nome, ''));
  v_antes jsonb := '{}'::jsonb;
  v_depois jsonb := '{}'::jsonb;
begin
  if length(v_nome) < 3 then
    perform portal_atendimento.erro('INVALID_INPUT', 'Informe o nome completo.', 'name');
  end if;
  if p_perfil is distinct from v_alvo.perfil_key then
    if v_alvo.id = v_ator then
      perform portal_atendimento.erro('SELF_ACTION', 'Você não pode alterar o seu próprio perfil.', 'role');
    end if;
    if not portal_atendimento.pode_atribuir(v_ator, p_perfil) then
      perform portal_atendimento.erro('ROLE_NOT_ALLOWED', 'Você só pode atribuir perfis do seu nível para baixo.', 'role');
    end if;
    v_antes := v_antes || jsonb_build_object('role', v_alvo.perfil_key);
    v_depois := v_depois || jsonb_build_object('role', p_perfil);
  end if;
  if v_nome <> v_alvo.nome then
    v_antes := v_antes || jsonb_build_object('name', v_alvo.nome);
    v_depois := v_depois || jsonb_build_object('name', v_nome);
  end if;
  if v_depois = '{}'::jsonb then
    return;
  end if;

  update portal_atendimento.usuarios set nome = v_nome, perfil_key = p_perfil where id = p_id;
  perform portal_atendimento.registrar_auditoria(v_ator, 'usuarios', 'update', format('Dados de %s alterados', v_nome), v_antes, v_depois, p_id::text);
end;
$$;

-- Inativar bloqueia o acesso ao portal na hora (as policies exigem usuário ativo). As sessões de login
-- não são apagadas: a conta é compartilhada com outros sistemas da Calper, que continuam funcionando.
create or replace function portal_atendimento.definir_status_usuario(p_id uuid, p_ativo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_alvo portal_atendimento.usuarios := portal_atendimento.carregar_alvo_usuario(v_ator, p_id,
    case when p_ativo then null else 'Você não pode inativar a sua própria conta.' end);
  v_novo text;
begin
  v_novo := case when not p_ativo then 'inactive' when v_alvo.last_access_at is null then 'pending' else 'active' end;
  if v_novo = v_alvo.status then
    return;
  end if;
  update portal_atendimento.usuarios set status = v_novo where id = p_id;
  perform portal_atendimento.registrar_auditoria(
    v_ator, 'usuarios', case when p_ativo then 'activate' else 'deactivate' end,
    case when p_ativo then format('Conta de %s reativada', v_alvo.nome)
         else format('Conta de %s inativada e acesso ao portal bloqueado', v_alvo.nome) end,
    jsonb_build_object('status', v_alvo.status), jsonb_build_object('status', v_novo), p_id::text
  );
end;
$$;

-- Tira o acesso ao portal. A conta de login (auth.users) fica: ela é compartilhada com outros sistemas.
create or replace function portal_atendimento.excluir_usuario(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_alvo portal_atendimento.usuarios := portal_atendimento.carregar_alvo_usuario(v_ator, p_id, 'Você não pode excluir a sua própria conta.');
begin
  delete from portal_atendimento.usuarios where id = p_id;
  perform portal_atendimento.registrar_auditoria(v_ator, 'usuarios', 'delete', format('Conta de %s excluída do portal', v_alvo.nome),
    jsonb_build_object('name', v_alvo.nome, 'email', v_alvo.email, 'role', v_alvo.perfil_key), null, p_id::text);
end;
$$;

-- Confere a permissão e registra; o front então pede o e-mail ao Supabase Auth (resetPasswordForEmail).
create or replace function portal_atendimento.registrar_redefinicao_senha(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_alvo portal_atendimento.usuarios := portal_atendimento.carregar_alvo_usuario(v_ator, p_id, null);
begin
  perform portal_atendimento.registrar_auditoria(v_ator, 'usuarios', 'password_reset',
    format('Link de redefinição de senha enviado para %s', v_alvo.email), null, null, p_id::text);
  return v_alvo.email;
end;
$$;

-- ============================================================================================
-- Sessão do próprio usuário
-- ============================================================================================

-- Chamado depois do login: marca o último acesso e conclui o convite de quem já tinha senha.
create or replace function portal_atendimento.registrar_acesso()
returns void
language sql
security definer
set search_path = ''
as $$
  update portal_atendimento.usuarios
  set last_access_at = now(),
      status = case when status = 'pending' and not must_change_password then 'active' else status end
  where id = (select auth.uid()) and status <> 'inactive';
$$;

-- Chamado depois do supabase.auth.updateUser({ password }): libera o acesso de quem tinha troca obrigatória.
create or replace function portal_atendimento.concluir_troca_senha()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_alvo portal_atendimento.usuarios := (select u from portal_atendimento.usuarios u where u.id = v_ator);
begin
  if v_alvo.id is null or v_alvo.status = 'inactive' then
    perform portal_atendimento.erro('NO_PORTAL_ACCESS', 'Seu e-mail ainda não está autorizado no portal.');
  end if;
  update portal_atendimento.usuarios
  set must_change_password = false,
      status = case when status = 'pending' then 'active' else status end,
      last_access_at = now()
  where id = v_ator;
  perform portal_atendimento.registrar_auditoria(v_ator, 'autenticacao', 'password_change',
    format('%s definiu uma senha pessoal', v_alvo.nome), null, null, v_ator::text);
end;
$$;

-- ============================================================================================
-- Integrações (regra 9: segredo só de escrita, guardado no Vault)
-- ============================================================================================

create or replace function portal_atendimento.atualizar_integracao(p_key text, p_remetente text, p_enviar_emails_auth boolean, p_ativo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_atual portal_atendimento.integracoes;
  v_remetente text := trim(coalesce(p_remetente, ''));
  v_antes jsonb := '{}'::jsonb;
  v_depois jsonb := '{}'::jsonb;
begin
  if portal_atendimento.perfil_de(v_ator) is distinct from 'super_admin' then
    perform portal_atendimento.erro('FORBIDDEN', 'Somente super admin pode configurar integrações.');
  end if;
  select * into v_atual from portal_atendimento.integracoes i where i.key = p_key;
  if v_atual.key is null then
    perform portal_atendimento.erro('NOT_FOUND', 'Integração não encontrada.');
  end if;
  if v_remetente !~ '^([^<>]+<[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>|[^@\s]+@[^@\s]+\.[^@\s]+)$' then
    perform portal_atendimento.erro('INVALID_INPUT', 'Use o formato Nome <email@dominio.com.br>.', 'sender');
  end if;

  if v_remetente <> v_atual.remetente then
    v_antes := v_antes || jsonb_build_object('sender', v_atual.remetente);
    v_depois := v_depois || jsonb_build_object('sender', v_remetente);
  end if;
  if p_enviar_emails_auth is distinct from v_atual.enviar_emails_auth then
    v_antes := v_antes || jsonb_build_object('sendAuthEmails', v_atual.enviar_emails_auth);
    v_depois := v_depois || jsonb_build_object('sendAuthEmails', p_enviar_emails_auth);
  end if;
  if p_ativo is distinct from v_atual.ativo then
    v_antes := v_antes || jsonb_build_object('active', v_atual.ativo);
    v_depois := v_depois || jsonb_build_object('active', p_ativo);
  end if;
  if v_depois = '{}'::jsonb then
    return;
  end if;

  update portal_atendimento.integracoes
  set remetente = v_remetente, enviar_emails_auth = p_enviar_emails_auth, ativo = p_ativo
  where key = p_key;
  perform portal_atendimento.registrar_auditoria(v_ator, 'integracoes', 'config', 'Configuração da integração alterada', v_antes, v_depois, p_key);
end;
$$;

create or replace function portal_atendimento.substituir_segredo_integracao(p_key text, p_segredo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_atual portal_atendimento.integracoes;
  v_segredo text := trim(coalesce(p_segredo, ''));
  v_nome_vault text := 'portal_atendimento_integracao_' || p_key;
  v_id uuid;
begin
  if portal_atendimento.perfil_de(v_ator) is distinct from 'super_admin' then
    perform portal_atendimento.erro('FORBIDDEN', 'Somente super admin pode configurar integrações.');
  end if;
  select * into v_atual from portal_atendimento.integracoes i where i.key = p_key;
  if v_atual.key is null then
    perform portal_atendimento.erro('NOT_FOUND', 'Integração não encontrada.');
  end if;
  if length(v_segredo) < 8 then
    perform portal_atendimento.erro('INVALID_INPUT', 'Informe a nova chave completa.', 'secret');
  end if;

  v_id := coalesce(v_atual.segredo_id, (select s.id from vault.secrets s where s.name = v_nome_vault));
  if v_id is null then
    v_id := vault.create_secret(v_segredo, v_nome_vault, format('Chave de API da integração %s do Portal Atendimento', p_key));
  else
    perform vault.update_secret(v_id, v_segredo);
  end if;

  update portal_atendimento.integracoes
  set segredo_id = v_id,
      segredo_mascara = left(v_segredo, 3) || '••••',
      segredo_definido_em = now(),
      segredo_definido_por = (select u.nome from portal_atendimento.usuarios u where u.id = v_ator)
  where key = p_key;
  -- O valor da chave nunca vai para a auditoria.
  perform portal_atendimento.registrar_auditoria(v_ator, 'integracoes', 'secret', 'Chave de API substituída', null, null, p_key);
end;
$$;

-- ============================================================================================
-- Sessões ativas (regra 11)
-- ============================================================================================

create or replace function portal_atendimento.listar_sessoes()
returns table (
  id uuid,
  user_id uuid,
  nome text,
  email text,
  user_agent text,
  ip text,
  iniciada_em timestamptz,
  ultima_atividade timestamptz,
  atual boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not portal_atendimento.tem_permissao_de((select auth.uid()), 'manage_sessions') then
    perform portal_atendimento.erro('FORBIDDEN', 'Você não tem permissão para esta ação.');
  end if;
  return query
    select s.id, s.user_id, u.nome, u.email, s.user_agent, host(s.ip),
           s.created_at, coalesce(s.refreshed_at at time zone 'UTC', s.updated_at, s.created_at),
           s.id::text = (select auth.jwt() ->> 'session_id')
    from auth.sessions s
    join portal_atendimento.usuarios u on u.id = s.user_id
    where s.not_after is null or s.not_after > now()
    order by 8 desc;
end;
$$;

-- Encerra uma sessão de login. Atenção: a conta é compartilhada, então a sessão pode ser de outro sistema da Calper.
create or replace function portal_atendimento.encerrar_sessao(p_sessao uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_sessao record;
begin
  if not portal_atendimento.tem_permissao_de(v_ator, 'manage_sessions') then
    perform portal_atendimento.erro('FORBIDDEN', 'Você não tem permissão para esta ação.');
  end if;
  select s.id, s.user_agent, u.nome into v_sessao
  from auth.sessions s join portal_atendimento.usuarios u on u.id = s.user_id
  where s.id = p_sessao;
  if v_sessao.id is null then
    perform portal_atendimento.erro('NOT_FOUND', 'Sessão não encontrada ou já encerrada.');
  end if;
  if p_sessao::text = (select auth.jwt() ->> 'session_id') then
    perform portal_atendimento.erro('SELF_ACTION', 'Você não pode encerrar a sua própria sessão por aqui.');
  end if;

  delete from auth.sessions where id = p_sessao;  -- os refresh tokens saem junto (FK em cascata)
  perform portal_atendimento.registrar_auditoria(v_ator, 'sessoes', 'session_revoked',
    format('Sessão de %s encerrada (%s)', v_sessao.nome, coalesce(v_sessao.user_agent, 'dispositivo desconhecido')), null, null, p_sessao::text);
end;
$$;

-- ============================================================================================
-- Permissões de execução: só usuários logados; o anon não executa nada.
-- ============================================================================================

revoke all on function
  portal_atendimento.salvar_permissoes_perfil(text, jsonb),
  portal_atendimento.criar_perfil(text, text, text),
  portal_atendimento.editar_perfil(text, text, text, text),
  portal_atendimento.excluir_perfil(text),
  portal_atendimento.carregar_alvo_usuario(uuid, uuid, text),
  portal_atendimento.atualizar_usuario(uuid, text, text),
  portal_atendimento.definir_status_usuario(uuid, boolean),
  portal_atendimento.excluir_usuario(uuid),
  portal_atendimento.registrar_redefinicao_senha(uuid),
  portal_atendimento.registrar_acesso(),
  portal_atendimento.concluir_troca_senha(),
  portal_atendimento.atualizar_integracao(text, text, boolean, boolean),
  portal_atendimento.substituir_segredo_integracao(text, text),
  portal_atendimento.listar_sessoes(),
  portal_atendimento.encerrar_sessao(uuid)
from public, anon;

grant execute on function
  portal_atendimento.salvar_permissoes_perfil(text, jsonb),
  portal_atendimento.criar_perfil(text, text, text),
  portal_atendimento.editar_perfil(text, text, text, text),
  portal_atendimento.excluir_perfil(text),
  portal_atendimento.atualizar_usuario(uuid, text, text),
  portal_atendimento.definir_status_usuario(uuid, boolean),
  portal_atendimento.excluir_usuario(uuid),
  portal_atendimento.registrar_redefinicao_senha(uuid),
  portal_atendimento.registrar_acesso(),
  portal_atendimento.concluir_troca_senha(),
  portal_atendimento.atualizar_integracao(text, text, boolean, boolean),
  portal_atendimento.substituir_segredo_integracao(text, text),
  portal_atendimento.listar_sessoes(),
  portal_atendimento.encerrar_sessao(uuid)
to authenticated, service_role;

-- carregar_alvo_usuario é peça interna das RPCs acima.
revoke execute on function portal_atendimento.carregar_alvo_usuario(uuid, uuid, text) from authenticated;
