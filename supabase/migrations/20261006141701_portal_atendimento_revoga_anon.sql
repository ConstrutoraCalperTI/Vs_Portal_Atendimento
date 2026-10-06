-- Modelo gerado a partir de calper-comercial/supabase/migrations/20260926170000_comercial_revoga_anon.sql.
-- portal_atendimento = schema do aplicativo; Portal Atendimento = nome. Não aplique este arquivo: use `npm run novo-app`.

-- Fase 1 da conexão do Portal Atendimento ao schema `portal_atendimento` (projeto compartilhado da Calper).
--
-- O papel `anon` (requisição sem login) tinha SELECT/INSERT/UPDATE/DELETE em todas as tabelas do
-- schema, protegido só pela RLS. Antes de expor `portal_atendimento` na API, o anon perde qualquer acesso.
-- Só remove permissões: nenhuma tabela, coluna ou dado é alterado. Os papéis `authenticated` e
-- `service_role` continuam como estão (as policies deles são refeitas na fase 2).

revoke usage on schema portal_atendimento from anon;

revoke all on all tables in schema portal_atendimento from anon;
revoke all on all sequences in schema portal_atendimento from anon;
revoke all on all functions in schema portal_atendimento from anon;

-- Objetos criados no futuro neste schema também nascem sem acesso para o anon.
alter default privileges in schema portal_atendimento revoke all on tables from anon;
alter default privileges in schema portal_atendimento revoke all on sequences from anon;
alter default privileges in schema portal_atendimento revoke all on functions from anon;
