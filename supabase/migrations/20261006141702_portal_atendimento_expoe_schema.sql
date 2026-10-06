-- Modelo gerado a partir de calper-comercial/supabase/migrations/20260926171000_expoe_schema_comercial.sql.
-- portal_atendimento = schema do aplicativo; Portal Atendimento = nome. Não aplique este arquivo: use `npm run novo-app`.

-- Expõe o schema do aplicativo na API (PostgREST) do projeto compartilhado.
--
-- O papel `authenticator` tem `pgrst.db_schemas` gravado no próprio banco, e esse valor tem
-- prioridade sobre o painel (Settings → Data API). Aqui o schema é ACRESCENTADO à lista atual:
-- nunca sobrescreva a lista com um valor fixo, porque ela atende todos os sistemas da Calper.

do $$
declare
  v_atual text;
begin
  select split_part(c, '=', 2) into v_atual
  from pg_roles r, unnest(r.rolconfig) c
  where r.rolname = 'authenticator' and c like 'pgrst.db_schemas=%';
  v_atual := coalesce(nullif(btrim(v_atual), ''), 'public');
  if not ('portal_atendimento' = any (string_to_array(replace(v_atual, ' ', ''), ','))) then
    execute format('alter role authenticator set pgrst.db_schemas = %L', v_atual || ', portal_atendimento');
  end if;
end;
$$;

notify pgrst, 'reload config';
