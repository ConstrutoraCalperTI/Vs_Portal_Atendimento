-- Gestão Tickets Movidesk: anexos dos tickets importados (pedido do Wagner, 14/10/2026; revê a D3, que guardava só nome e caminho).
-- Cada ação gravada põe os anexos dela na fila md_anexos (gatilho, sem duplicar pelo caminho do Movidesk). A rodada da Edge
-- portal_atendimento-movidesk baixa os pendentes (GET /storage/download?id=<path>, que redireciona para o arquivo) e guarda no
-- bucket privado movidesk-anexos, em movidesk/<ticket>/<ação>/<arquivo>. Mesma janela da agenda; 3 tentativas; acima do limite
-- vira "grande". Ver e baixar: Admin e Super admin (como a tela Tickets). Migração aditiva.

alter table portal_atendimento.md_config
  add column if not exists baixar_anexos boolean not null default true,
  add column if not exists anexo_max_mb integer not null default 50 check (anexo_max_mb between 1 and 50),
  add column if not exists anexos_travado_ate timestamptz;

create table if not exists portal_atendimento.md_anexos (
  id bigserial primary key,
  ticket_id bigint not null references portal_atendimento.md_tickets (id) on delete cascade,
  acao_id integer not null,
  nome text not null,
  caminho_movidesk text not null unique,
  enviado_em timestamptz,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'baixando', 'baixado', 'erro', 'grande')),
  tentativas integer not null default 0,
  reservado_ate timestamptz,
  proxima_tentativa timestamptz,
  storage_path text,
  tipo text,
  tamanho bigint,
  erro text,
  baixado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists md_anexos_ticket_idx on portal_atendimento.md_anexos (ticket_id, acao_id);
create index if not exists md_anexos_fila_idx on portal_atendimento.md_anexos (situacao, id) where situacao in ('pendente', 'baixando', 'erro');

alter table portal_atendimento.md_anexos enable row level security;
revoke all on portal_atendimento.md_anexos from anon, authenticated;
grant all on portal_atendimento.md_anexos to service_role;
grant usage, select on sequence portal_atendimento.md_anexos_id_seq to service_role;

-- Ação gravada (a página troca as ações inteiras) → anexos novos entram na fila; os já baixados ficam como estão.
create or replace function portal_atendimento.md_acao_anexos_fila()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into portal_atendimento.md_anexos (ticket_id, acao_id, nome, caminho_movidesk, enviado_em)
  select new.ticket_id, new.acao_id, left(a ->> 'nome', 255), a ->> 'caminho', nullif(a ->> 'em', '')::timestamptz
  from jsonb_array_elements(coalesce(new.anexos, '[]'::jsonb)) a
  where nullif(a ->> 'caminho', '') is not null and nullif(a ->> 'nome', '') is not null
  on conflict (caminho_movidesk) do nothing;
  return null;
end;
$$;
drop trigger if exists md_acao_anexos_fila on portal_atendimento.md_ticket_acoes;
create trigger md_acao_anexos_fila after insert on portal_atendimento.md_ticket_acoes
  for each row execute function portal_atendimento.md_acao_anexos_fila();

-- ---------- Bucket privado ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('movidesk-anexos', 'movidesk-anexos', false, 52428800)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'movidesk-anexos: leitura') then
    create policy "movidesk-anexos: leitura" on storage.objects for select to authenticated
      using (bucket_id = 'movidesk-anexos' and (select portal_atendimento.ch_eh_admin()));
  end if;
end;
$$;

-- ============================================================================================
-- Rodada dos anexos (só a Edge)
-- ============================================================================================

/**
 * Reserva até p_limite anexos para baixar agora (pendentes, os que ficaram presos em "baixando" e os com erro que ainda têm
 * tentativa). Na origem 'agenda' respeita a janela da agenda (sem a recorrência) e a chave "baixar anexos".
 * Devolve {maxBytes, anexos: [{id, ticketId, acaoId, nome, caminho}]} ou null.
 */
create or replace function portal_atendimento.md_anexos_pegar(p_origem text, p_limite integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c portal_atendimento.md_config;
  v jsonb;
begin
  select * into c from portal_atendimento.md_config;
  if c.token_segredo_id is null or not c.baixar_anexos then
    return null;
  end if;
  if p_origem = 'agenda' then
    c.ultima_rodada_em := null;
    if not portal_atendimento.md_na_agenda(c, now()) then
      return null;
    end if;
  end if;

  with escolhidos as (
    select a.id
    from portal_atendimento.md_anexos a
    where a.situacao = 'pendente'
       or (a.situacao = 'baixando' and a.reservado_ate < now())
       or (a.situacao = 'erro' and a.tentativas < 3 and coalesce(a.proxima_tentativa, now()) <= now())
    order by a.id
    limit greatest(least(p_limite, 200), 1)
    for update skip locked
  ), marcados as (
    update portal_atendimento.md_anexos a
    set situacao = 'baixando', reservado_ate = now() + interval '5 minutes'
    from escolhidos e
    where a.id = e.id
    returning a.id, a.ticket_id, a.acao_id, a.nome, a.caminho_movidesk
  )
  select jsonb_agg(jsonb_build_object('id', m.id, 'ticketId', m.ticket_id, 'acaoId', m.acao_id, 'nome', m.nome, 'caminho', m.caminho_movidesk) order by m.id)
  into v
  from marcados m;

  if v is null then
    return null;
  end if;
  return jsonb_build_object('maxBytes', c.anexo_max_mb::bigint * 1024 * 1024, 'anexos', v);
end;
$$;

/** Resultado de um anexo: {id, ok, storagePath, tipo, tamanho, grande, erro}. Erro agenda nova tentativa em 30 min (até 3). */
create or replace function portal_atendimento.md_anexo_resultado(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((p ->> 'ok')::boolean, false) then
    update portal_atendimento.md_anexos
    set situacao = 'baixado', storage_path = p ->> 'storagePath', tipo = left(p ->> 'tipo', 120), tamanho = (p ->> 'tamanho')::bigint,
        erro = null, reservado_ate = null, baixado_em = now()
    where id = (p ->> 'id')::bigint;
  elsif coalesce((p ->> 'grande')::boolean, false) then
    update portal_atendimento.md_anexos
    set situacao = 'grande', tamanho = (p ->> 'tamanho')::bigint, erro = left(p ->> 'erro', 500), reservado_ate = null
    where id = (p ->> 'id')::bigint;
  else
    update portal_atendimento.md_anexos
    set situacao = 'erro', tentativas = tentativas + 1, erro = left(p ->> 'erro', 500), reservado_ate = null,
        proxima_tentativa = now() + interval '30 minutes'
    where id = (p ->> 'id')::bigint;
  end if;
end;
$$;

-- ============================================================================================
-- Telas
-- ============================================================================================

/** Anexos de um ticket (Admin e Super admin). O arquivo abre por URL assinada do Storage, gerada no navegador. */
create or replace function portal_atendimento.md_ticket_anexos(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not portal_atendimento.md_pode_ver() then
    perform portal_atendimento.erro('FORBIDDEN', 'Só Admin e Super admin veem a base de tickets do Movidesk.');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'acaoId', a.acao_id, 'nome', a.nome, 'situacao', a.situacao, 'tamanho', a.tamanho,
      'tipo', a.tipo, 'storagePath', a.storage_path, 'erro', a.erro) order by a.acao_id, a.id)
    from portal_atendimento.md_anexos a where a.ticket_id = p_id), '[]'::jsonb);
end;
$$;

/** Configuração da integração: agora com os anexos (chave, limite e progresso). */
create or replace function portal_atendimento.md_config_ler()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c portal_atendimento.md_config;
  v_total bigint;
  v_media numeric;
  v_anexos jsonb;
begin
  perform portal_atendimento.md_exigir_super();
  select * into c from portal_atendimento.md_config;
  select count(*) into v_total from portal_atendimento.md_tickets;
  select avg(e.ms) into v_media from (
    select ms from portal_atendimento.md_execucoes where ok and tickets > 0 and ms is not null order by em desc limit 50) e;
  select jsonb_build_object(
    'total', count(*),
    'baixados', count(*) filter (where situacao = 'baixado'),
    'pendentes', count(*) filter (where situacao in ('pendente', 'baixando') or (situacao = 'erro' and tentativas < 3)),
    'erros', count(*) filter (where situacao = 'erro' and tentativas >= 3),
    'grandes', count(*) filter (where situacao = 'grande'),
    'bytes', coalesce(sum(tamanho) filter (where situacao = 'baixado'), 0))
  into v_anexos
  from portal_atendimento.md_anexos;
  return jsonb_build_object(
    'tokenFinal', c.token_final, 'tokenDefinidoEm', c.token_definido_em,
    'select', c.campos_select, 'expand', c.campos_expand,
    'agenda', jsonb_build_object('ativo', c.ativo, 'janelaInicio', to_char(c.janela_inicio, 'HH24:MI'), 'janelaFim', to_char(c.janela_fim, 'HH24:MI'),
      'dias', to_jsonb(c.dias), 'recorrenciaMin', c.recorrencia_min, 'paginasPorRodada', c.paginas_por_rodada,
      'incrementalDiaTodo', c.incremental_dia_todo, 'incrementalRecorrenciaMin', c.incremental_recorrencia_min,
      'baixarAnexos', c.baixar_anexos, 'anexoMaxMb', c.anexo_max_mb),
    'estado', jsonb_build_object('etapa', c.etapa, 'cursorPastId', c.cursor_past_id, 'cursorRecentesId', c.cursor_recentes_id,
      'incrementalDesde', c.incremental_desde, 'cargaIniciadaEm', c.carga_iniciada_em, 'cargaConcluidaEm', c.carga_concluida_em,
      'maiorIdMovidesk', c.maior_id_movidesk, 'rodando', coalesce(c.travado_ate > now(), false), 'ultimaRodadaEm', c.ultima_rodada_em,
      'totalTickets', v_total, 'mediaMsPagina', round(v_media)),
    'anexos', v_anexos,
    'ultimoTeste', c.ultimo_teste);
end;
$$;

/** Salva a agenda (mesmas regras da migration anterior) e a parte dos anexos. */
create or replace function portal_atendimento.md_config_salvar(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ini time;
  v_fim time;
  v_dias smallint[];
  v_max integer := coalesce((p ->> 'anexoMaxMb')::int, 50);
begin
  perform portal_atendimento.md_exigir_super();
  begin
    v_ini := (p ->> 'janelaInicio')::time;
    v_fim := (p ->> 'janelaFim')::time;
  exception when others then
    perform portal_atendimento.erro('INVALID_INPUT', 'Informe os horários no formato HH:MM.', 'janelaInicio');
  end;
  if v_ini is null or v_fim is null or v_ini = v_fim then
    perform portal_atendimento.erro('INVALID_INPUT', 'O horário inicial e o final precisam ser diferentes.', 'janelaFim');
  end if;
  select array_agg(distinct d::smallint order by d::smallint) into v_dias
  from jsonb_array_elements_text(coalesce(p -> 'dias', '[]'::jsonb)) d where d ~ '^[0-6]$';
  if v_dias is null then
    perform portal_atendimento.erro('INVALID_INPUT', 'Escolha pelo menos um dia da semana.', 'dias');
  end if;
  if coalesce((p ->> 'recorrenciaMin')::int, 0) not in (1, 5, 10, 30, 60)
     or coalesce((p ->> 'incrementalRecorrenciaMin')::int, 0) not in (1, 5, 10, 30, 60) then
    perform portal_atendimento.erro('INVALID_INPUT', 'Recorrência inválida.', 'recorrenciaMin');
  end if;
  if coalesce((p ->> 'paginasPorRodada')::int, 0) not between 1 and 3 then
    perform portal_atendimento.erro('INVALID_INPUT', 'Páginas por rodada: de 1 a 3.', 'paginasPorRodada');
  end if;
  if v_max not between 1 and 50 then
    perform portal_atendimento.erro('INVALID_INPUT', 'O limite por anexo vai de 1 a 50 MB.', 'anexoMaxMb');
  end if;
  if length(trim(coalesce(p ->> 'select', ''))) < 2 or position('id' in coalesce(p ->> 'select', '')) = 0 then
    perform portal_atendimento.erro('INVALID_INPUT', 'O $select precisa ter pelo menos o campo id.', 'select');
  end if;
  update portal_atendimento.md_config set
    ativo = coalesce((p ->> 'ativo')::boolean, false),
    janela_inicio = v_ini, janela_fim = v_fim, dias = v_dias,
    recorrencia_min = (p ->> 'recorrenciaMin')::int,
    paginas_por_rodada = (p ->> 'paginasPorRodada')::int,
    incremental_dia_todo = coalesce((p ->> 'incrementalDiaTodo')::boolean, true),
    incremental_recorrencia_min = (p ->> 'incrementalRecorrenciaMin')::int,
    baixar_anexos = coalesce((p ->> 'baixarAnexos')::boolean, true),
    anexo_max_mb = v_max,
    campos_select = regexp_replace(trim(p ->> 'select'), '\s+', '', 'g'),
    campos_expand = trim(coalesce(p ->> 'expand', '')),
    atualizado_em = now(), atualizado_por = (select auth.uid());
end;
$$;

/** Tenta de novo os anexos que esgotaram as tentativas (Super admin). */
create or replace function portal_atendimento.md_anexos_tentar_de_novo()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform portal_atendimento.md_exigir_super();
  update portal_atendimento.md_anexos set situacao = 'pendente', tentativas = 0, proxima_tentativa = null, erro = null
  where situacao = 'erro';
  get diagnostics n = row_count;
  return n;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['md_ticket_anexos(bigint)', 'md_anexos_tentar_de_novo()'] loop
    execute format('revoke execute on function portal_atendimento.%s from public, anon', f);
    execute format('grant execute on function portal_atendimento.%s to authenticated', f);
  end loop;
  foreach f in array array['md_anexos_pegar(text, integer)', 'md_anexo_resultado(jsonb)', 'md_acao_anexos_fila()'] loop
    execute format('revoke execute on function portal_atendimento.%s from public, anon, authenticated', f);
    execute format('grant execute on function portal_atendimento.%s to service_role', f);
  end loop;
end;
$$;
