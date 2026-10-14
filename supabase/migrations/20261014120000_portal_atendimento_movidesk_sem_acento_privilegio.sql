-- Gestão Tickets Movidesk: md_sem_acento (migration 20261014100000) ficou com o EXECUTE padrão de PUBLIC. A regra do portal
-- é anon sem privilégio em nada do schema (tests/db/security.db.test.ts). Ela só é usada dentro das funções security definer.
revoke execute on function portal_atendimento.md_sem_acento(text) from public, anon, authenticated;
grant execute on function portal_atendimento.md_sem_acento(text) to service_role;
