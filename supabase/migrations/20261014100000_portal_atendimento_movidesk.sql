-- Gestão Tickets Movidesk (docs/PLANO-tickets-movidesk.md, mockup docs/mockups/tickets-movidesk.html, aprovado em 14/10/2026).
-- Espelho só leitura (D6) da base de tickets do Movidesk: carga histórica (/tickets e depois /tickets/past, por id) e,
-- quando ela termina, só o incremental (/tickets por lastUpdate e id, D2). Uma página de 100 por rodada (D4): o pg_cron
-- chama a Edge portal_atendimento-movidesk a cada minuto e ela confere a agenda, trava, busca, grava e destrava.
-- Ticket em colunas, ações e históricos em tabelas próprias, anexos só nome e link (D3); busca por tsvector sem acento (D5).
-- Ver: Admin e Super admin (D1). Configurar a integração: só Super admin (como as outras Integrações).
-- Migração aditiva: só cria.

-- ---------- Texto sem acento (sem depender da extensão unaccent, que não está instalada) ----------
create or replace function portal_atendimento.md_sem_acento(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(translate(coalesce(p, ''),
    'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaaeeeeiiiiooooouuuucnaaaaaaeeeeiiiiooooouuuucn'));
$$;

-- ---------- Configuração e estado da sincronização (linha única) ----------
create table if not exists portal_atendimento.md_config (
  id boolean primary key default true check (id),
  token_segredo_id uuid,
  token_final text,
  token_definido_em timestamptz,
  campos_select text not null default 'id,protocol,type,subject,category,urgency,status,baseStatus,justification,origin,createdDate,originEmailAccount,ownerTeam,serviceFirstLevelId,serviceFirstLevel,serviceSecondLevel,serviceThirdLevel,contactForm,cc,resolvedIn,reopenedIn,closedIn,lastActionDate,actionCount,lastUpdate,lifeTimeWorkingTime,stoppedTime,stoppedTimeWorkingTime,resolvedInFirstCall,chatWidget,chatGroup,chatTalkTime,chatWaitingTime,sequence,slaAgreement,slaAgreementRule,slaSolutionTime,slaResponseTime,slaSolutionChangedByUser,slaSolutionDate,slaSolutionDateIsPaused,slaResponseDate,slaRealResponseDate',
  campos_expand text not null default 'actions($expand=createdBy,attachments),clients($expand=organization),owner,createdBy,customFieldValues,ownerHistories($expand=owner,changedBy),statusHistories($expand=changedBy)',
  -- Agenda (horário de São Paulo). Janela que passa da meia-noite vale (19:00 → 07:00).
  ativo boolean not null default false,
  janela_inicio time not null default '19:00',
  janela_fim time not null default '07:00',
  dias smallint[] not null default '{0,1,2,3,4,5,6}', -- 0 = domingo
  recorrencia_min integer not null default 1 check (recorrencia_min in (1, 5, 10, 30, 60)),
  paginas_por_rodada integer not null default 1 check (paginas_por_rodada between 1 and 3),
  incremental_dia_todo boolean not null default true,
  incremental_recorrencia_min integer not null default 10 check (incremental_recorrencia_min in (1, 5, 10, 30, 60)),
  -- Estado
  -- Ordem: recentes (/tickets, últimos 90 dias) → past (/tickets/past) → incremental. Nessa ordem, o ticket que passa dos 90 dias
  -- durante a carga sai de /tickets e ainda é pego em /tickets/past.
  etapa text not null default 'recentes' check (etapa in ('recentes', 'past', 'incremental')),
  cursor_past_id bigint not null default 0,
  cursor_recentes_id bigint not null default 0,
  incremental_desde timestamptz,
  incremental_cursor_id bigint not null default 0,
  incremental_maior_update timestamptz,
  carga_iniciada_em timestamptz,
  carga_concluida_em timestamptz,
  maior_id_movidesk bigint,
  travado_ate timestamptz,
  ultima_rodada_em timestamptz,
  ultimo_teste jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
insert into portal_atendimento.md_config (id) values (true) on conflict (id) do nothing;

-- ---------- Tickets ----------
create table if not exists portal_atendimento.md_tickets (
  id bigint primary key,
  protocolo text,
  tipo smallint,
  assunto text,
  categoria text,
  urgencia text,
  status text,
  status_base text,
  justificativa text,
  origem smallint,
  criado_em timestamptz,
  conta_email_origem text,
  equipe text,
  servico_1_id bigint,
  servico_1 text,
  servico_2 text,
  servico_3 text,
  -- Caminho para exibir e filtrar: Third › Second › First (o First é o nível mais específico).
  servico text,
  forma_contato text,
  cc text,
  resolvido_em timestamptz,
  reaberto_em timestamptz,
  fechado_em timestamptz,
  ultima_acao_em timestamptz,
  qtd_acoes integer,
  atualizado_movidesk timestamptz,
  tempo_vida_util numeric,
  tempo_parado numeric,
  tempo_parado_util numeric,
  resolvido_primeiro_contato boolean,
  chat_widget text,
  chat_grupo text,
  chat_conversa numeric,
  chat_espera numeric,
  sequencia integer,
  sla_acordo text,
  sla_regra text,
  sla_solucao_min numeric,
  sla_resposta_min numeric,
  sla_solucao_alterado boolean,
  sla_solucao_em timestamptz,
  sla_solucao_pausado boolean,
  sla_resposta_em timestamptz,
  sla_resposta_real_em timestamptz,
  responsavel_id text,
  responsavel text,
  responsavel_email text,
  criado_por_id text,
  criado_por text,
  clientes jsonb not null default '[]'::jsonb,
  campos_adicionais jsonb not null default '[]'::jsonb,
  busca tsvector,
  sincronizado_em timestamptz not null default now()
);
create index if not exists md_tickets_criado_em_idx on portal_atendimento.md_tickets (criado_em desc, id desc);
create index if not exists md_tickets_atualizado_idx on portal_atendimento.md_tickets (atualizado_movidesk);
create index if not exists md_tickets_responsavel_idx on portal_atendimento.md_tickets (responsavel);
create index if not exists md_tickets_equipe_idx on portal_atendimento.md_tickets (equipe);
create index if not exists md_tickets_status_base_idx on portal_atendimento.md_tickets (status_base);
create index if not exists md_tickets_servico_idx on portal_atendimento.md_tickets (servico);
create index if not exists md_tickets_protocolo_idx on portal_atendimento.md_tickets (protocolo) where protocolo is not null;
create index if not exists md_tickets_busca_idx on portal_atendimento.md_tickets using gin (busca);

create table if not exists portal_atendimento.md_ticket_acoes (
  ticket_id bigint not null references portal_atendimento.md_tickets (id) on delete cascade,
  acao_id integer not null,
  tipo smallint,
  origem smallint,
  status text,
  justificativa text,
  texto text,
  criado_em timestamptz,
  criado_por_id text,
  criado_por text,
  anexos jsonb not null default '[]'::jsonb,
  primary key (ticket_id, acao_id)
);

create table if not exists portal_atendimento.md_ticket_status_hist (
  ticket_id bigint not null references portal_atendimento.md_tickets (id) on delete cascade,
  seq integer not null,
  status text,
  justificativa text,
  alterado_em timestamptz,
  alterado_por text,
  permanencia_util numeric,
  primary key (ticket_id, seq)
);

create table if not exists portal_atendimento.md_ticket_responsavel_hist (
  ticket_id bigint not null references portal_atendimento.md_tickets (id) on delete cascade,
  seq integer not null,
  responsavel text,
  equipe text,
  alterado_em timestamptz,
  alterado_por text,
  permanencia_util numeric,
  primary key (ticket_id, seq)
);

-- Origem vem como número. Os códigos de 1 a 9 são os da documentação do Movidesk; outros aparecem como "Origem N".
create table if not exists portal_atendimento.md_origens (
  codigo smallint primary key,
  nome text not null
);
insert into portal_atendimento.md_origens (codigo, nome) values
  (1, 'Web (cliente)'), (2, 'Web (agente)'), (3, 'E-mail recebido'), (4, 'Gatilho do sistema'), (5, 'Chat (online)'),
  (6, 'Chat (offline)'), (7, 'E-mail enviado pelo sistema'), (8, 'Formulário de contato'), (9, 'Web API')
on conflict (codigo) do nothing;

create table if not exists portal_atendimento.md_execucoes (
  id bigserial primary key,
  em timestamptz not null default now(),
  origem text not null check (origem in ('agenda', 'manual', 'teste')),
  etapa text,
  filtro text,
  tickets integer not null default 0,
  ms integer,
  kb integer,
  http integer,
  ok boolean not null,
  erro text,
  por uuid
);
create index if not exists md_execucoes_em_idx on portal_atendimento.md_execucoes (em desc);

-- Acesso só pelas funções abaixo.
do $$
declare
  t text;
begin
  foreach t in array array['md_config', 'md_tickets', 'md_ticket_acoes', 'md_ticket_status_hist', 'md_ticket_responsavel_hist', 'md_origens', 'md_execucoes'] loop
    execute format('alter table portal_atendimento.%I enable row level security', t);
    execute format('revoke all on portal_atendimento.%I from anon, authenticated', t);
    execute format('grant all on portal_atendimento.%I to service_role', t);
  end loop;
end;
$$;
grant usage, select on sequence portal_atendimento.md_execucoes_id_seq to service_role;

-- ---------- Chave do agendamento (pg_cron → Edge) ----------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'portal_atendimento_movidesk_cron') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'portal_atendimento_movidesk_cron',
      'Chave do pg_cron para a Edge portal_atendimento-movidesk (Portal Atendimento)');
  end if;
end;
$$;

create or replace function portal_atendimento.md_cron_chave()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.decrypted_secret from vault.decrypted_secrets d where d.name = 'portal_atendimento_movidesk_cron';
$$;

-- ============================================================================================
-- Leitura (Admin e Super admin, D1)
-- ============================================================================================

create or replace function portal_atendimento.md_pode_ver()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select portal_atendimento.ch_eh_admin();
$$;

/** Situação curta da sincronização para o cabeçalho da tela Tickets. */
create or replace function portal_atendimento.md_situacao()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('etapa', c.etapa, 'ativo', c.ativo, 'ultimaRodadaEm', c.ultima_rodada_em,
    'cargaConcluidaEm', c.carga_concluida_em, 'temToken', c.token_segredo_id is not null)
  from portal_atendimento.md_config c;
$$;

/**
 * Lista com os filtros da tela (todos opcionais): num (id ou protocolo), de/ate (dia de abertura em São Paulo, AAAA-MM-DD),
 * ano, servico, responsavel, statusBase, equipe, texto (palavras do assunto e das ações). 100 por página, mais recentes primeiro.
 */
create or replace function portal_atendimento.md_tickets_lista(p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_num text := nullif(trim(p ->> 'num'), '');
  v_de date := nullif(p ->> 'de', '')::date;
  v_ate date := nullif(p ->> 'ate', '')::date;
  v_ano integer := nullif(p ->> 'ano', '')::integer;
  v_servico text := nullif(p ->> 'servico', '');
  v_resp text := nullif(p ->> 'responsavel', '');
  v_status text := nullif(p ->> 'statusBase', '');
  v_equipe text := nullif(p ->> 'equipe', '');
  v_pagina integer := greatest(coalesce((p ->> 'pagina')::integer, 1), 1);
  v_termos text[];
  v_q tsquery;
  v_total bigint;
  v_lista jsonb;
begin
  if not portal_atendimento.md_pode_ver() then
    perform portal_atendimento.erro('FORBIDDEN', 'Só Admin e Super admin veem a base de tickets do Movidesk.');
  end if;

  -- Cada palavra vira prefixo (boleto → boleto:*), todas obrigatórias.
  select array_agg(t) into v_termos
  from regexp_split_to_table(portal_atendimento.md_sem_acento(p ->> 'texto'), '[^a-z0-9]+') t
  where length(t) >= 2;
  if v_termos is not null then
    v_q := to_tsquery('portuguese', array_to_string(array(select quote_literal(t) || ':*' from unnest(v_termos) t), ' & '));
  end if;

  with f as (
    select t.*
    from portal_atendimento.md_tickets t
    where (v_num is null or t.id::text = v_num or t.protocolo = v_num)
      and (v_de is null or t.criado_em >= (v_de::timestamp at time zone 'America/Sao_Paulo'))
      and (v_ate is null or t.criado_em < ((v_ate + 1)::timestamp at time zone 'America/Sao_Paulo'))
      and (v_ano is null or extract(year from t.criado_em at time zone 'America/Sao_Paulo') = v_ano)
      and (v_servico is null or t.servico = v_servico)
      and (v_resp is null or t.responsavel = v_resp)
      and (v_status is null or t.status_base = v_status)
      and (v_equipe is null or t.equipe = v_equipe)
      and (v_q is null or t.busca @@ v_q)
  )
  select (select count(*) from f),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'protocolo', x.protocolo, 'assunto', x.assunto, 'origem', coalesce(o.nome, 'Origem ' || x.origem),
        'tipo', x.tipo, 'categoria', x.categoria, 'qtdAcoes', x.qtd_acoes, 'servico', x.servico, 'responsavel', x.responsavel,
        'equipe', x.equipe, 'criadoEm', x.criado_em, 'status', x.status, 'statusBase', x.status_base,
        'slaSolucaoEm', x.sla_solucao_em, 'slaPausado', coalesce(x.sla_solucao_pausado, false), 'resolvidoEm', x.resolvido_em,
        'fechadoEm', x.fechado_em) order by x.criado_em desc nulls last, x.id desc)
      from (select * from f order by f.criado_em desc nulls last, f.id desc limit 100 offset (v_pagina - 1) * 100) x
      left join portal_atendimento.md_origens o on o.codigo = x.origem
    ), '[]'::jsonb)
  into v_total, v_lista;

  return jsonb_build_object('total', v_total, 'pagina', v_pagina, 'porPagina', 100, 'tickets', v_lista);
end;
$$;

/** Valores para os filtros (anos, serviços, responsáveis, equipes e status base presentes na base). */
create or replace function portal_atendimento.md_filtros_opcoes()
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
  return jsonb_build_object(
    'anos', coalesce((select jsonb_agg(a order by a desc) from (select distinct extract(year from criado_em at time zone 'America/Sao_Paulo')::int a from portal_atendimento.md_tickets where criado_em is not null) s), '[]'::jsonb),
    'servicos', coalesce((select jsonb_agg(v order by v) from (select distinct servico v from portal_atendimento.md_tickets where servico is not null) s), '[]'::jsonb),
    'responsaveis', coalesce((select jsonb_agg(v order by v) from (select distinct responsavel v from portal_atendimento.md_tickets where responsavel is not null) s), '[]'::jsonb),
    'equipes', coalesce((select jsonb_agg(v order by v) from (select distinct equipe v from portal_atendimento.md_tickets where equipe is not null) s), '[]'::jsonb),
    'statusBase', coalesce((select jsonb_agg(v order by v) from (select distinct status_base v from portal_atendimento.md_tickets where status_base is not null) s), '[]'::jsonb),
    'situacao', portal_atendimento.md_situacao()
  );
end;
$$;

create or replace function portal_atendimento.md_ticket_detalhe(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not portal_atendimento.md_pode_ver() then
    perform portal_atendimento.erro('FORBIDDEN', 'Só Admin e Super admin veem a base de tickets do Movidesk.');
  end if;
  select jsonb_build_object(
    'id', t.id, 'protocolo', t.protocolo, 'assunto', t.assunto, 'origem', coalesce(o.nome, 'Origem ' || t.origem), 'tipo', t.tipo,
    'categoria', t.categoria, 'urgencia', t.urgencia, 'status', t.status, 'statusBase', t.status_base, 'justificativa', t.justificativa,
    'servico', t.servico, 'responsavel', t.responsavel, 'equipe', t.equipe, 'criadoEm', t.criado_em, 'criadoPor', t.criado_por,
    'resolvidoEm', t.resolvido_em, 'fechadoEm', t.fechado_em, 'reabertoEm', t.reaberto_em, 'slaSolucaoEm', t.sla_solucao_em,
    'slaPausado', coalesce(t.sla_solucao_pausado, false), 'slaRespostaEm', t.sla_resposta_em, 'slaRespostaRealEm', t.sla_resposta_real_em,
    'atualizadoEm', t.atualizado_movidesk, 'clientes', t.clientes, 'camposAdicionais', t.campos_adicionais,
    'acoes', coalesce((select jsonb_agg(jsonb_build_object('id', a.acao_id, 'tipo', a.tipo, 'texto', a.texto, 'criadoEm', a.criado_em,
        'criadoPor', a.criado_por, 'status', a.status, 'anexos', a.anexos) order by a.acao_id)
      from portal_atendimento.md_ticket_acoes a where a.ticket_id = t.id), '[]'::jsonb),
    'historicoStatus', coalesce((select jsonb_agg(jsonb_build_object('status', h.status, 'justificativa', h.justificativa,
        'em', h.alterado_em, 'por', h.alterado_por) order by h.seq)
      from portal_atendimento.md_ticket_status_hist h where h.ticket_id = t.id), '[]'::jsonb),
    'historicoResponsavel', coalesce((select jsonb_agg(jsonb_build_object('responsavel', h.responsavel, 'equipe', h.equipe,
        'em', h.alterado_em, 'por', h.alterado_por) order by h.seq)
      from portal_atendimento.md_ticket_responsavel_hist h where h.ticket_id = t.id), '[]'::jsonb))
  into v
  from portal_atendimento.md_tickets t
  left join portal_atendimento.md_origens o on o.codigo = t.origem
  where t.id = p_id;
  if v is null then
    perform portal_atendimento.erro('NOT_FOUND', 'Ticket não encontrado na base do Movidesk.');
  end if;
  return v;
end;
$$;

-- ============================================================================================
-- Integração (só Super admin)
-- ============================================================================================

create or replace function portal_atendimento.md_exigir_super()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not portal_atendimento.eh_super_admin() then
    perform portal_atendimento.erro('FORBIDDEN', 'Só o Super admin configura a integração com o Movidesk.');
  end if;
end;
$$;

/** Configuração, agenda, progresso e estimativa (sem o token). */
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
begin
  perform portal_atendimento.md_exigir_super();
  select * into c from portal_atendimento.md_config;
  select count(*) into v_total from portal_atendimento.md_tickets;
  select avg(e.ms) into v_media from (
    select ms from portal_atendimento.md_execucoes where ok and tickets > 0 and ms is not null order by em desc limit 50) e;
  return jsonb_build_object(
    'tokenFinal', c.token_final, 'tokenDefinidoEm', c.token_definido_em,
    'select', c.campos_select, 'expand', c.campos_expand,
    'agenda', jsonb_build_object('ativo', c.ativo, 'janelaInicio', to_char(c.janela_inicio, 'HH24:MI'), 'janelaFim', to_char(c.janela_fim, 'HH24:MI'),
      'dias', to_jsonb(c.dias), 'recorrenciaMin', c.recorrencia_min, 'paginasPorRodada', c.paginas_por_rodada,
      'incrementalDiaTodo', c.incremental_dia_todo, 'incrementalRecorrenciaMin', c.incremental_recorrencia_min),
    'estado', jsonb_build_object('etapa', c.etapa, 'cursorPastId', c.cursor_past_id, 'cursorRecentesId', c.cursor_recentes_id,
      'incrementalDesde', c.incremental_desde, 'cargaIniciadaEm', c.carga_iniciada_em, 'cargaConcluidaEm', c.carga_concluida_em,
      'maiorIdMovidesk', c.maior_id_movidesk, 'rodando', coalesce(c.travado_ate > now(), false), 'ultimaRodadaEm', c.ultima_rodada_em,
      'totalTickets', v_total, 'mediaMsPagina', round(v_media)),
    'ultimoTeste', c.ultimo_teste);
end;
$$;

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
    campos_select = regexp_replace(trim(p ->> 'select'), '\s+', '', 'g'),
    campos_expand = trim(coalesce(p ->> 'expand', '')),
    atualizado_em = now(), atualizado_por = (select auth.uid());
end;
$$;

/** Guarda o token no Vault. Aceita o valor colado da URL: recorta o GUID (ex.: "…-…&$" vira só o GUID). */
create or replace function portal_atendimento.md_token_salvar(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := lower(substring(coalesce(p_token, '') from '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}'));
  v_id uuid;
begin
  perform portal_atendimento.md_exigir_super();
  if v_token is null then
    perform portal_atendimento.erro('INVALID_INPUT', 'O token do Movidesk é um código de 36 caracteres (ex.: 1a2b3c4d-…). Confira o que foi colado.', 'token');
  end if;
  select token_segredo_id into v_id from portal_atendimento.md_config;
  if v_id is null or not exists (select 1 from vault.secrets where id = v_id) then
    v_id := vault.create_secret(v_token, 'portal_atendimento_movidesk_token_' || replace(gen_random_uuid()::text, '-', ''), 'Token da API Movidesk (Portal Atendimento)');
  else
    perform vault.update_secret(v_id, v_token);
  end if;
  update portal_atendimento.md_config
  set token_segredo_id = v_id, token_final = right(v_token, 4), token_definido_em = now(), ultimo_teste = null,
      atualizado_em = now(), atualizado_por = (select auth.uid());
  return right(v_token, 4);
end;
$$;

create or replace function portal_atendimento.md_execucoes_lista(p_so_erros boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform portal_atendimento.md_exigir_super();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'em', e.em, 'origem', e.origem, 'etapa', e.etapa, 'filtro', e.filtro,
      'tickets', e.tickets, 'ms', e.ms, 'kb', e.kb, 'http', e.http, 'ok', e.ok, 'erro', e.erro) order by e.em desc, e.id desc)
    from (select * from portal_atendimento.md_execucoes
          where em > now() - interval '7 days' and (not p_so_erros or not ok)
          order by em desc, id desc limit 100) e), '[]'::jsonb);
end;
$$;

/** Recomeça a carga do zero (os tickets já gravados ficam; o upsert pelo id atualiza). */
create or replace function portal_atendimento.md_recomecar()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform portal_atendimento.md_exigir_super();
  update portal_atendimento.md_config set etapa = 'recentes', cursor_past_id = 0, cursor_recentes_id = 0, incremental_desde = null,
    incremental_cursor_id = 0, incremental_maior_update = null, carga_iniciada_em = null, carga_concluida_em = null,
    atualizado_em = now(), atualizado_por = (select auth.uid());
end;
$$;

-- ============================================================================================
-- Rodada (só a Edge, com service_role)
-- ============================================================================================

create or replace function portal_atendimento.md_ler_credencial()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('token', d.decrypted_secret, 'select', c.campos_select, 'expand', c.campos_expand)
  from portal_atendimento.md_config c
  left join vault.decrypted_secrets d on d.id = c.token_segredo_id;
$$;

/** A agenda permite rodar agora? (horário de São Paulo; janela pode passar da meia-noite). */
create or replace function portal_atendimento.md_na_agenda(c portal_atendimento.md_config, p_agora timestamptz)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp := p_agora at time zone 'America/Sao_Paulo';
  v_hora time := v_local::time;
  v_dia smallint := extract(dow from v_local)::smallint;
  v_rec integer := case when c.etapa = 'incremental' then c.incremental_recorrencia_min else c.recorrencia_min end;
begin
  if not c.ativo then
    return false;
  end if;
  -- Recorrência: 20 s de folga para o minuto do pg_cron não escorregar.
  if c.ultima_rodada_em is not null and p_agora < c.ultima_rodada_em + make_interval(mins => v_rec) - interval '20 seconds' then
    return false;
  end if;
  if c.etapa = 'incremental' and c.incremental_dia_todo then
    return true;
  end if;
  if c.janela_inicio < c.janela_fim then
    -- Janela no mesmo dia.
    return v_dia = any (c.dias) and v_hora >= c.janela_inicio and v_hora < c.janela_fim;
  end if;
  -- Janela que passa da meia-noite: depois do início vale o dia de hoje; antes do fim, o dia em que a janela abriu (ontem).
  return (v_hora >= c.janela_inicio and v_dia = any (c.dias))
      or (v_hora < c.janela_fim and ((v_dia + 6) % 7)::smallint = any (c.dias));
end;
$$;

/**
 * Começa uma rodada: confere token, agenda (só origem 'agenda') e a trava. Devolve null se não for para rodar agora,
 * ou {etapa, rota, filtro, cursor, paginas}. A trava dura 4 min por página (a Edge não começa página nova depois de 60 s).
 */
create or replace function portal_atendimento.md_rodada_iniciar(p_origem text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c portal_atendimento.md_config;
begin
  select * into c from portal_atendimento.md_config for update;
  if c.token_segredo_id is null then
    return null;
  end if;
  if p_origem = 'agenda' and not portal_atendimento.md_na_agenda(c, now()) then
    return null;
  end if;
  if c.travado_ate is not null and c.travado_ate > now() then
    return null;
  end if;
  update portal_atendimento.md_config
  set travado_ate = now() + make_interval(mins => 4 * c.paginas_por_rodada),
      carga_iniciada_em = coalesce(carga_iniciada_em, case when etapa <> 'incremental' then now() end)
  where id
  returning * into c;
  return portal_atendimento.md_rodada_proxima(c) || jsonb_build_object('paginas', case when p_origem = 'agenda' then c.paginas_por_rodada else 1 end);
end;
$$;

/** Rota e filtro OData da próxima página, conforme a etapa e o cursor. */
create or replace function portal_atendimento.md_rodada_proxima(c portal_atendimento.md_config)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case c.etapa
    when 'past' then jsonb_build_object('etapa', 'past', 'rota', 'tickets/past', 'filtro', 'id gt ' || c.cursor_past_id)
    when 'recentes' then jsonb_build_object('etapa', 'recentes', 'rota', 'tickets', 'filtro', 'id gt ' || c.cursor_recentes_id)
    else jsonb_build_object('etapa', 'incremental', 'rota', 'tickets', 'filtro',
      'lastUpdate ge ' || to_char(coalesce(c.incremental_desde, now() - interval '1 day') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.00"z"')
      || ' and id gt ' || c.incremental_cursor_id)
  end;
$$;

/**
 * Grava uma página já mapeada pela Edge: {tickets: [...md_tickets], acoes: [...], statusHist: [...], responsavelHist: [...]}.
 * Upsert pelo id; ações e históricos dos tickets da página são trocados inteiros. Recalcula a busca. Devolve quantos tickets.
 */
create or replace function portal_atendimento.md_upsert_pagina(p jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids bigint[];
begin
  select array_agg((t ->> 'id')::bigint) into v_ids from jsonb_array_elements(coalesce(p -> 'tickets', '[]'::jsonb)) t;
  if v_ids is null then
    return 0;
  end if;

  insert into portal_atendimento.md_tickets
  select * from jsonb_populate_recordset(null::portal_atendimento.md_tickets, (
    select jsonb_agg(t || jsonb_build_object('sincronizado_em', now(), 'clientes', coalesce(t -> 'clientes', '[]'::jsonb),
      'campos_adicionais', coalesce(t -> 'campos_adicionais', '[]'::jsonb)))
    from jsonb_array_elements(p -> 'tickets') t))
  on conflict (id) do update set
    protocolo = excluded.protocolo, tipo = excluded.tipo, assunto = excluded.assunto, categoria = excluded.categoria,
    urgencia = excluded.urgencia, status = excluded.status, status_base = excluded.status_base, justificativa = excluded.justificativa,
    origem = excluded.origem, criado_em = excluded.criado_em, conta_email_origem = excluded.conta_email_origem, equipe = excluded.equipe,
    servico_1_id = excluded.servico_1_id, servico_1 = excluded.servico_1, servico_2 = excluded.servico_2, servico_3 = excluded.servico_3,
    servico = excluded.servico, forma_contato = excluded.forma_contato, cc = excluded.cc, resolvido_em = excluded.resolvido_em,
    reaberto_em = excluded.reaberto_em, fechado_em = excluded.fechado_em, ultima_acao_em = excluded.ultima_acao_em,
    qtd_acoes = excluded.qtd_acoes, atualizado_movidesk = excluded.atualizado_movidesk, tempo_vida_util = excluded.tempo_vida_util,
    tempo_parado = excluded.tempo_parado, tempo_parado_util = excluded.tempo_parado_util,
    resolvido_primeiro_contato = excluded.resolvido_primeiro_contato, chat_widget = excluded.chat_widget, chat_grupo = excluded.chat_grupo,
    chat_conversa = excluded.chat_conversa, chat_espera = excluded.chat_espera, sequencia = excluded.sequencia,
    sla_acordo = excluded.sla_acordo, sla_regra = excluded.sla_regra, sla_solucao_min = excluded.sla_solucao_min,
    sla_resposta_min = excluded.sla_resposta_min, sla_solucao_alterado = excluded.sla_solucao_alterado,
    sla_solucao_em = excluded.sla_solucao_em, sla_solucao_pausado = excluded.sla_solucao_pausado,
    sla_resposta_em = excluded.sla_resposta_em, sla_resposta_real_em = excluded.sla_resposta_real_em,
    responsavel_id = excluded.responsavel_id, responsavel = excluded.responsavel, responsavel_email = excluded.responsavel_email,
    criado_por_id = excluded.criado_por_id, criado_por = excluded.criado_por, clientes = excluded.clientes,
    campos_adicionais = excluded.campos_adicionais, sincronizado_em = now();

  delete from portal_atendimento.md_ticket_acoes where ticket_id = any (v_ids);
  delete from portal_atendimento.md_ticket_status_hist where ticket_id = any (v_ids);
  delete from portal_atendimento.md_ticket_responsavel_hist where ticket_id = any (v_ids);

  insert into portal_atendimento.md_ticket_acoes
  select * from jsonb_populate_recordset(null::portal_atendimento.md_ticket_acoes, coalesce(p -> 'acoes', '[]'::jsonb))
  on conflict do nothing;
  insert into portal_atendimento.md_ticket_status_hist
  select * from jsonb_populate_recordset(null::portal_atendimento.md_ticket_status_hist, coalesce(p -> 'statusHist', '[]'::jsonb))
  on conflict do nothing;
  insert into portal_atendimento.md_ticket_responsavel_hist
  select * from jsonb_populate_recordset(null::portal_atendimento.md_ticket_responsavel_hist, coalesce(p -> 'responsavelHist', '[]'::jsonb))
  on conflict do nothing;

  -- Busca: assunto (peso A) + texto das ações (limitado a 200 mil letras por ticket).
  update portal_atendimento.md_tickets t
  set busca = setweight(to_tsvector('portuguese', portal_atendimento.md_sem_acento(t.assunto)), 'A')
           || to_tsvector('portuguese', portal_atendimento.md_sem_acento(left(coalesce(a.textos, ''), 200000)))
  from (
    select x.id, (select string_agg(ac.texto, ' ' order by ac.acao_id) from portal_atendimento.md_ticket_acoes ac where ac.ticket_id = x.id) textos
    from unnest(v_ids) as x(id)
  ) a
  where t.id = a.id;

  return array_length(v_ids, 1);
end;
$$;

/**
 * Fecha uma página: registra a execução e avança o cursor. p = {origem, etapa, filtro, qtd, ultimoId, maiorUpdate, ms, kb,
 * http, erro, ultima (true = acabou a rodada: solta a trava)}. Página com menos de 100 encerra a etapa:
 * recentes → past → incremental (começando no início da carga menos 5 min); no incremental, recomeça do maior lastUpdate visto.
 */
create or replace function portal_atendimento.md_rodada_concluir(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c portal_atendimento.md_config;
  v_ok boolean := nullif(p ->> 'erro', '') is null;
  v_qtd integer := coalesce((p ->> 'qtd')::int, 0);
  v_ultimo bigint := nullif(p ->> 'ultimoId', '')::bigint;
  v_maior timestamptz := nullif(p ->> 'maiorUpdate', '')::timestamptz;
  v_fim_etapa boolean := v_qtd < 100;
begin
  insert into portal_atendimento.md_execucoes (origem, etapa, filtro, tickets, ms, kb, http, ok, erro, por)
  values (coalesce(p ->> 'origem', 'agenda'), p ->> 'etapa', p ->> 'filtro', v_qtd, (p ->> 'ms')::int, (p ->> 'kb')::int,
          (p ->> 'http')::int, v_ok, left(p ->> 'erro', 1000), nullif(p ->> 'por', '')::uuid);
  delete from portal_atendimento.md_execucoes where em < now() - interval '30 days';

  select * into c from portal_atendimento.md_config for update;
  if v_ok and c.etapa = p ->> 'etapa' then
    if c.etapa = 'recentes' then
      update portal_atendimento.md_config set cursor_recentes_id = greatest(cursor_recentes_id, coalesce(v_ultimo, cursor_recentes_id)),
        etapa = case when v_fim_etapa then 'past' else etapa end where id;
    elsif c.etapa = 'past' then
      update portal_atendimento.md_config set cursor_past_id = greatest(cursor_past_id, coalesce(v_ultimo, cursor_past_id)),
        etapa = case when v_fim_etapa then 'incremental' else etapa end,
        incremental_desde = case when v_fim_etapa then coalesce(carga_iniciada_em, now()) - interval '5 minutes' else incremental_desde end,
        incremental_cursor_id = 0, incremental_maior_update = null,
        carga_concluida_em = case when v_fim_etapa then now() else carga_concluida_em end
      where id;
    else
      update portal_atendimento.md_config set
        incremental_maior_update = greatest(incremental_maior_update, v_maior),
        incremental_cursor_id = case when v_fim_etapa then 0 else greatest(incremental_cursor_id, coalesce(v_ultimo, 0)) end
      where id;
      if v_fim_etapa then
        update portal_atendimento.md_config
        set incremental_desde = greatest(coalesce(incremental_desde, '-infinity'), coalesce(incremental_maior_update - interval '5 minutes', incremental_desde)),
            incremental_maior_update = null
        where id;
      end if;
    end if;
  end if;

  if coalesce((p ->> 'ultima')::boolean, true) or not v_ok then
    update portal_atendimento.md_config set travado_ate = null, ultima_rodada_em = now() where id;
  end if;
  select * into c from portal_atendimento.md_config;
  return portal_atendimento.md_rodada_proxima(c);
end;
$$;

/** Resultado do "Testar conexão" (Edge) e o maior id do Movidesk, para a estimativa. */
create or replace function portal_atendimento.md_teste_registrar(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update portal_atendimento.md_config
  set ultimo_teste = p - 'maiorId', maior_id_movidesk = coalesce(nullif(p ->> 'maiorId', '')::bigint, maior_id_movidesk)
  where id;
  insert into portal_atendimento.md_execucoes (origem, etapa, filtro, tickets, ms, http, ok, erro, por)
  select 'teste', r ->> 'rota', null, 0, (r ->> 'ms')::int, (r ->> 'http')::int, coalesce((r ->> 'ok')::boolean, false), r ->> 'erro', nullif(p ->> 'por', '')::uuid
  from jsonb_array_elements(coalesce(p -> 'rotas', '[]'::jsonb)) r;
end;
$$;

-- ---------- Permissões das funções ----------
do $$
declare
  f text;
begin
  foreach f in array array['md_situacao()', 'md_tickets_lista(jsonb)', 'md_filtros_opcoes()', 'md_ticket_detalhe(bigint)',
                           'md_config_ler()', 'md_config_salvar(jsonb)', 'md_token_salvar(text)', 'md_execucoes_lista(boolean)', 'md_recomecar()'] loop
    execute format('revoke execute on function portal_atendimento.%s from public, anon', f);
    execute format('grant execute on function portal_atendimento.%s to authenticated', f);
  end loop;
  foreach f in array array['md_cron_chave()', 'md_ler_credencial()', 'md_rodada_iniciar(text)', 'md_upsert_pagina(jsonb)',
                           'md_rodada_concluir(jsonb)', 'md_teste_registrar(jsonb)', 'md_exigir_super()', 'md_pode_ver()',
                           'md_na_agenda(portal_atendimento.md_config, timestamptz)', 'md_rodada_proxima(portal_atendimento.md_config)'] loop
    execute format('revoke execute on function portal_atendimento.%s from public, anon, authenticated', f);
    execute format('grant execute on function portal_atendimento.%s to service_role', f);
  end loop;
end;
$$;

-- ---------- Agendamento: a cada minuto a Edge confere a agenda e roda uma página ----------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'portal-atendimento-movidesk-1min') then
    perform cron.unschedule('portal-atendimento-movidesk-1min');
  end if;
  perform cron.schedule('portal-atendimento-movidesk-1min', '* * * * *', $job$
    select net.http_post(
      url := 'https://cjofyxgcuvpeeslkfawu.supabase.co/functions/v1/portal_atendimento-movidesk',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-movidesk-chave', portal_atendimento.md_cron_chave()),
      body := '{"acao": "rodada"}'::jsonb,
      timeout_milliseconds := 10000
    );
  $job$);
end;
$$;
