-- Modelo gerado a partir de calper-comercial/supabase/migrations/20260926190300_comercial_funcoes_sem_anon.sql.
-- __APP__ = schema do aplicativo; __APP_NAME__ = nome. Não aplique este arquivo: use `npm run novo-app`.

-- Fase 3: fecha para o anon as funções do schema `__APP__` que ainda tinham o EXECUTE padrão (PUBLIC).
--
-- - Funções de trigger (definir_atualizado_em, proteger_*): o trigger dispara sem depender de EXECUTE,
--   então ninguém precisa executá-las direto.
-- - Funções legadas (has_role, is_*): usadas pelas policies das tabelas de negócio, que são avaliadas
--   como `authenticated`. Por isso o authenticated recebe o EXECUTE explícito antes de o PUBLIC sair.

grant execute on function
  __APP__.has_role(uuid, __APP__.app_role),
  __APP__.is_calper_domain(text)
to authenticated, service_role;

do $$
declare
  v_funcao regprocedure;
begin
  -- is_broker_profile_owner / is_document_owner: assinaturas legadas lidas do catálogo.
  for v_funcao in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = '__APP__' and p.proname in ('is_broker_profile_owner', 'is_document_owner')
  loop
    execute format('grant execute on function %s to authenticated, service_role', v_funcao);
    execute format('revoke execute on function %s from public, anon', v_funcao);
  end loop;
end;
$$;

revoke execute on function
  __APP__.has_role(uuid, __APP__.app_role),
  __APP__.is_calper_domain(text)
from public, anon;

revoke execute on function
  __APP__.definir_atualizado_em(),
  __APP__.proteger_perfil_sistema(),
  __APP__.proteger_proprietario()
from public, anon, authenticated;
