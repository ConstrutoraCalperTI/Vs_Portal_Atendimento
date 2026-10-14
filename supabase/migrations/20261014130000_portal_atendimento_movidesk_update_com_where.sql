-- Gestão Tickets Movidesk: "Salvar agenda" falhava na tela com a mensagem genérica. O papel authenticator do PostgREST
-- carrega a extensão safeupdate (session_preload_libraries), que recusa UPDATE sem WHERE. md_config tem uma linha só e
-- md_config_salvar, md_token_salvar e md_recomecar faziam "update md_config set …" sem WHERE (pelo SQL do painel, como
-- postgres, passava). Mesmas funções, agora com "where id". Migração aditiva.

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
    atualizado_em = now(), atualizado_por = (select auth.uid())
  where id;
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
      atualizado_em = now(), atualizado_por = (select auth.uid())
  where id;
  return right(v_token, 4);
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
    atualizado_em = now(), atualizado_por = (select auth.uid())
  where id;
end;
$$;
