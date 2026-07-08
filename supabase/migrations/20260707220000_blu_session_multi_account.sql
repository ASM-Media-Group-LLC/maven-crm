-- blu_session: permitir múltiples cuentas-agencia de BLU (id 1=plus/Kash Plus,
-- 2=massive/Kash Massive, … reservado hasta 20). Antes: CHECK (id = 1) — de cuando
-- BLU era una sola cuenta — hacía que el blu-bridge multi-cuenta NO pudiera persistir
-- el token de Massive (id=2): "new row ... violates check constraint blu_session_id_check"
-- → Massive andaba con el seed pero sin auto-refresh. Relajado a 1..20. Aplicado en
-- prod 2026-07-07 (hotfix) — esta migración lo deja en el repo.
alter table public.blu_session drop constraint if exists blu_session_id_check;
alter table public.blu_session add constraint blu_session_id_check check (id >= 1 and id <= 20);
