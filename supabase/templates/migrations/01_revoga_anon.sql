-- Modelo gerado a partir de calper-comercial/supabase/migrations/20260926170000_comercial_revoga_anon.sql.
-- __APP__ = schema do aplicativo; __APP_NAME__ = nome. Não aplique este arquivo: use `npm run novo-app`.

-- Fase 1 da conexão do __APP_NAME__ ao schema `__APP__` (projeto compartilhado da Calper).
--
-- O papel `anon` (requisição sem login) tinha SELECT/INSERT/UPDATE/DELETE em todas as tabelas do
-- schema, protegido só pela RLS. Antes de expor `__APP__` na API, o anon perde qualquer acesso.
-- Só remove permissões: nenhuma tabela, coluna ou dado é alterado. Os papéis `authenticated` e
-- `service_role` continuam como estão (as policies deles são refeitas na fase 2).

revoke usage on schema __APP__ from anon;

revoke all on all tables in schema __APP__ from anon;
revoke all on all sequences in schema __APP__ from anon;
revoke all on all functions in schema __APP__ from anon;

-- Objetos criados no futuro neste schema também nascem sem acesso para o anon.
alter default privileges in schema __APP__ revoke all on tables from anon;
alter default privileges in schema __APP__ revoke all on sequences from anon;
alter default privileges in schema __APP__ revoke all on functions from anon;
