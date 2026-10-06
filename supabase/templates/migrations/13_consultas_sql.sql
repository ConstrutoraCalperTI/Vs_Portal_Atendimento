-- Modelo gerado a partir de calper-comercial/supabase/migrations/20260927000000_comercial_consultas_sql.sql.
-- __APP__ = schema do aplicativo; __APP_NAME__ = nome. Não aplique este arquivo: use `npm run novo-app`.

-- Fase 5B: aba Consultas SQL (Configurações > Integrações), somente super admin.
--
-- `api_queries` é o catálogo das consultas do TOTVS RM (RealizaConsulta/<código>). Ele também guia as
-- sincronizações (fase 8): cada rotina acha a sua consulta pelo CÓDIGO e só roda se ela estiver ativa.
-- Por isso as consultas usadas por uma sincronização não podem ser excluídas nem ter o código trocado.
--
-- Aditivo: colunas, índice, check e trigger novos; o acesso direto do front é revogado (as policies
-- antigas, abertas a qualquer logado, ficam sem efeito por falta de GRANT). Nada é apagado.

alter table __APP__.api_queries
  add column if not exists ultimo_teste jsonb,
  add column if not exists atualizado_por uuid;

-- Tipos do cadastro original (o "status" é usado em produção, fora da lista antiga do front).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'api_queries_query_type_check'
                 and conrelid = '__APP__.api_queries'::regclass) then
    alter table __APP__.api_queries
      add constraint api_queries_query_type_check
      check (query_type in ('resumo', 'componentes', 'kpis', 'grafico', 'detalhes', 'status'));
  end if;
end $$;

create unique index if not exists api_queries_integracao_codigo_key
  on __APP__.api_queries (integration_id, upper(code));

create or replace trigger api_queries_atualizado_em
  before update on __APP__.api_queries
  for each row execute function __APP__.definir_atualizado_em();

revoke all on table __APP__.api_queries from anon, authenticated;

-- ---------- Uso pelas sincronizações (fonte única: tela e regras de exclusão leem daqui) ----------

create or replace function __APP__.uso_consulta_sql(p_codigo text)
returns text
language sql
immutable
set search_path = ''
as $$
  -- Consulta usada por uma rotina do sistema (sincronização etc.): devolva o nome da rotina.
  -- Enquanto devolve null, qualquer consulta pode ser excluída ou ter o código trocado.
  -- Ex.: select case upper(split_part(coalesce(p_codigo, ''), '/', 1)) when 'API.00.00.000' then 'Sincronização X' end;
  select null::text where p_codigo is null or p_codigo is not null;
$$;

-- Código como a URL usa: maiúsculas, sem espaços e sem o sufixo padrão "/0/X" (acrescentado na chamada).
create or replace function __APP__.normalizar_codigo_consulta(p_codigo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(upper(regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g')), '/0/X$', '');
$$;

create or replace function __APP__.id_integracao_totvs()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from __APP__.integration_settings s where s.name = 'TOTVS RM';
$$;

create or replace function __APP__.exigir_super_admin(p_ator uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if __APP__.perfil_de(p_ator) is distinct from 'super_admin' then
    perform __APP__.erro('FORBIDDEN', 'Somente super admin pode configurar integrações.');
  end if;
end;
$$;

-- ---------- Leitura ----------

create or replace function __APP__.listar_consultas_sql()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform __APP__.exigir_super_admin((select auth.uid()));
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', q.id,
      'code', q.code,
      'name', q.name,
      'description', q.description,
      'type', q.query_type,
      'active', q.is_active,
      'order', q.display_order,
      'usedBy', __APP__.uso_consulta_sql(q.code),
      'lastTest', q.ultimo_teste
    ) order by q.display_order, q.created_at)
    from __APP__.api_queries q
    where q.integration_id = __APP__.id_integracao_totvs()
  ), '[]'::jsonb);
end;
$$;

-- ---------- Criar / editar ----------

create or replace function __APP__.salvar_consulta_sql(
  p_id uuid, p_codigo text, p_nome text, p_descricao text, p_tipo text, p_ativa boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_integracao uuid := __APP__.id_integracao_totvs();
  v_codigo text := __APP__.normalizar_codigo_consulta(p_codigo);
  v_nome text := trim(coalesce(p_nome, ''));
  v_descricao text := nullif(trim(coalesce(p_descricao, '')), '');
  v_atual __APP__.api_queries;
  v_id uuid;
  v_antes jsonb := '{}'::jsonb;
  v_depois jsonb := '{}'::jsonb;
begin
  perform __APP__.exigir_super_admin(v_ator);
  if v_integracao is null then
    perform __APP__.erro('NOT_FOUND', 'Conexão TOTVS RM não encontrada.');
  end if;
  if v_codigo !~ '^[A-Z0-9][A-Z0-9._-]{2,59}(/[A-Z0-9?._-]+)*$' then
    perform __APP__.erro('INVALID_INPUT', 'Use o código da consulta no RM, como API.00.02.001.', 'code');
  end if;
  if length(v_nome) not between 2 and 120 then
    perform __APP__.erro('INVALID_INPUT', 'O nome precisa ter entre 2 e 120 caracteres.', 'name');
  end if;
  if length(coalesce(v_descricao, '')) > 300 then
    perform __APP__.erro('INVALID_INPUT', 'Use no máximo 300 caracteres.', 'description');
  end if;
  if p_tipo is null or p_tipo not in ('resumo', 'componentes', 'kpis', 'grafico', 'detalhes', 'status') then
    perform __APP__.erro('INVALID_INPUT', 'Escolha o tipo de dados.', 'type');
  end if;
  if exists (
    select 1 from __APP__.api_queries q
    where q.integration_id = v_integracao and upper(q.code) = v_codigo and q.id is distinct from p_id
  ) then
    perform __APP__.erro('QUERY_EXISTS', format('Já existe uma consulta com o código %s.', v_codigo), 'code');
  end if;

  if p_id is null then
    insert into __APP__.api_queries (integration_id, code, name, description, query_type, is_active, display_order, atualizado_por)
    values (
      v_integracao, v_codigo, v_nome, v_descricao, p_tipo, coalesce(p_ativa, true),
      coalesce((select max(q.display_order) from __APP__.api_queries q where q.integration_id = v_integracao), 0) + 1,
      v_ator
    )
    returning id into v_id;
    perform __APP__.registrar_auditoria(v_ator, 'integracoes', 'create', format('Consulta SQL %s criada', v_codigo), null,
      jsonb_build_object('code', v_codigo, 'name', v_nome, 'type', p_tipo, 'active', coalesce(p_ativa, true)), 'consultas_sql');
    return v_id;
  end if;

  select * into v_atual from __APP__.api_queries q where q.id = p_id and q.integration_id = v_integracao for update;
  if v_atual.id is null then
    perform __APP__.erro('NOT_FOUND', 'Consulta não encontrada.');
  end if;
  if __APP__.uso_consulta_sql(v_atual.code) is not null
     and split_part(v_codigo, '/', 1) <> upper(split_part(v_atual.code, '/', 1)) then
    perform __APP__.erro('QUERY_IN_USE',
      format('O código não pode mudar: a consulta é usada na %s.', lower(__APP__.uso_consulta_sql(v_atual.code))), 'code');
  end if;

  if v_codigo <> v_atual.code then v_antes := v_antes || jsonb_build_object('code', v_atual.code); v_depois := v_depois || jsonb_build_object('code', v_codigo); end if;
  if v_nome <> v_atual.name then v_antes := v_antes || jsonb_build_object('name', v_atual.name); v_depois := v_depois || jsonb_build_object('name', v_nome); end if;
  if v_descricao is distinct from v_atual.description then v_antes := v_antes || jsonb_build_object('description', v_atual.description); v_depois := v_depois || jsonb_build_object('description', v_descricao); end if;
  if p_tipo <> v_atual.query_type then v_antes := v_antes || jsonb_build_object('type', v_atual.query_type); v_depois := v_depois || jsonb_build_object('type', p_tipo); end if;
  if coalesce(p_ativa, v_atual.is_active) <> v_atual.is_active then v_antes := v_antes || jsonb_build_object('active', v_atual.is_active); v_depois := v_depois || jsonb_build_object('active', p_ativa); end if;

  if v_depois <> '{}'::jsonb then
    update __APP__.api_queries
    set code = v_codigo, name = v_nome, description = v_descricao, query_type = p_tipo,
        is_active = coalesce(p_ativa, is_active), atualizado_por = v_ator
    where id = p_id;
    perform __APP__.registrar_auditoria(v_ator, 'integracoes', 'update', format('Consulta SQL %s alterada', v_codigo), v_antes, v_depois, 'consultas_sql');
  end if;
  return p_id;
end;
$$;

-- ---------- Ativar / desativar ----------

create or replace function __APP__.definir_consulta_sql_ativa(p_id uuid, p_ativa boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_atual __APP__.api_queries;
begin
  perform __APP__.exigir_super_admin(v_ator);
  select * into v_atual from __APP__.api_queries q where q.id = p_id and q.integration_id = __APP__.id_integracao_totvs() for update;
  if v_atual.id is null then
    perform __APP__.erro('NOT_FOUND', 'Consulta não encontrada.');
  end if;
  if p_ativa is null or p_ativa = v_atual.is_active then
    return;
  end if;
  update __APP__.api_queries set is_active = p_ativa, atualizado_por = v_ator where id = p_id;
  perform __APP__.registrar_auditoria(v_ator, 'integracoes', case when p_ativa then 'activate' else 'deactivate' end,
    format('Consulta SQL %s %s', v_atual.code, case when p_ativa then 'ativada' else 'desativada' end),
    jsonb_build_object('active', v_atual.is_active), jsonb_build_object('active', p_ativa), 'consultas_sql');
end;
$$;

-- ---------- Reordenar (subir/descer uma posição) ----------

create or replace function __APP__.mover_consulta_sql(p_id uuid, p_direcao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_integracao uuid := __APP__.id_integracao_totvs();
  v_atual __APP__.api_queries;
  v_vizinho __APP__.api_queries;
begin
  perform __APP__.exigir_super_admin(v_ator);
  if p_direcao not in ('up', 'down') then
    perform __APP__.erro('INVALID_INPUT', 'Direção inválida.');
  end if;

  -- Trava a lista e renumera 1..N (corrige empates e buracos antes de trocar).
  perform 1 from __APP__.api_queries q where q.integration_id = v_integracao for update;
  update __APP__.api_queries q set display_order = r.pos
  from (
    select id, row_number() over (order by display_order, created_at) as pos
    from __APP__.api_queries where integration_id = v_integracao
  ) r
  where q.id = r.id and q.display_order is distinct from r.pos;

  select * into v_atual from __APP__.api_queries q where q.id = p_id and q.integration_id = v_integracao;
  if v_atual.id is null then
    perform __APP__.erro('NOT_FOUND', 'Consulta não encontrada.');
  end if;
  select * into v_vizinho from __APP__.api_queries q
  where q.integration_id = v_integracao
    and q.display_order = v_atual.display_order + case when p_direcao = 'up' then -1 else 1 end;
  if v_vizinho.id is null then
    return; -- já está na ponta
  end if;

  update __APP__.api_queries set display_order = v_vizinho.display_order, atualizado_por = v_ator where id = v_atual.id;
  update __APP__.api_queries set display_order = v_atual.display_order where id = v_vizinho.id;
  perform __APP__.registrar_auditoria(v_ator, 'integracoes', 'config',
    format('Consulta SQL %s movida para a posição %s', v_atual.code, v_vizinho.display_order),
    jsonb_build_object('order', v_atual.display_order), jsonb_build_object('order', v_vizinho.display_order), 'consultas_sql');
end;
$$;

-- ---------- Excluir ----------

create or replace function __APP__.excluir_consulta_sql(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_atual __APP__.api_queries;
begin
  perform __APP__.exigir_super_admin(v_ator);
  select * into v_atual from __APP__.api_queries q where q.id = p_id and q.integration_id = __APP__.id_integracao_totvs() for update;
  if v_atual.id is null then
    perform __APP__.erro('NOT_FOUND', 'Consulta não encontrada.');
  end if;
  if __APP__.uso_consulta_sql(v_atual.code) is not null then
    perform __APP__.erro('QUERY_IN_USE',
      format('Esta consulta é usada na %s. Desative em vez de excluir.', lower(__APP__.uso_consulta_sql(v_atual.code))));
  end if;
  delete from __APP__.api_queries where id = p_id;
  perform __APP__.registrar_auditoria(v_ator, 'integracoes', 'delete', format('Consulta SQL %s excluída', v_atual.code),
    jsonb_build_object('code', v_atual.code, 'name', v_atual.name, 'type', v_atual.query_type, 'active', v_atual.is_active),
    null, 'consultas_sql');
end;
$$;

-- ---------- Teste (Edge Function __APP__-totvs, service_role) ----------

create or replace function __APP__.obter_consulta_para_teste(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select q.code from __APP__.api_queries q where q.id = p_id and q.integration_id = __APP__.id_integracao_totvs();
$$;

create or replace function __APP__.registrar_teste_consulta_sql(p_ator uuid, p_id uuid, p_ok boolean, p_mensagem text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb := jsonb_build_object('at', now(), 'ok', p_ok, 'message', p_mensagem);
  v_codigo text;
begin
  perform __APP__.exigir_super_admin(p_ator);
  update __APP__.api_queries set ultimo_teste = v_resultado where id = p_id returning code into v_codigo;
  perform __APP__.registrar_auditoria(p_ator, 'integracoes', 'test',
    format('Teste da consulta SQL %s: %s', v_codigo, case when p_ok then 'sucesso' else 'falhou' end),
    null, jsonb_build_object('ok', p_ok, 'message', p_mensagem), 'consultas_sql');
  return v_resultado;
end;
$$;

-- Catálogo inicial: vazio. As consultas do sistema são cadastradas pela tela (Integrações › Consultas SQL).

-- ---------- Permissões de execução ----------

revoke all on function
  __APP__.uso_consulta_sql(text),
  __APP__.normalizar_codigo_consulta(text),
  __APP__.id_integracao_totvs(),
  __APP__.exigir_super_admin(uuid),
  __APP__.listar_consultas_sql(),
  __APP__.salvar_consulta_sql(uuid, text, text, text, text, boolean),
  __APP__.definir_consulta_sql_ativa(uuid, boolean),
  __APP__.mover_consulta_sql(uuid, text),
  __APP__.excluir_consulta_sql(uuid),
  __APP__.obter_consulta_para_teste(uuid),
  __APP__.registrar_teste_consulta_sql(uuid, uuid, boolean, text)
from public, anon, authenticated;

grant execute on function
  __APP__.listar_consultas_sql(),
  __APP__.salvar_consulta_sql(uuid, text, text, text, text, boolean),
  __APP__.definir_consulta_sql_ativa(uuid, boolean),
  __APP__.mover_consulta_sql(uuid, text),
  __APP__.excluir_consulta_sql(uuid)
to authenticated;

grant execute on function
  __APP__.uso_consulta_sql(text),
  __APP__.normalizar_codigo_consulta(text),
  __APP__.id_integracao_totvs(),
  __APP__.exigir_super_admin(uuid),
  __APP__.obter_consulta_para_teste(uuid),
  __APP__.registrar_teste_consulta_sql(uuid, uuid, boolean, text)
to service_role;

notify pgrst, 'reload schema';
