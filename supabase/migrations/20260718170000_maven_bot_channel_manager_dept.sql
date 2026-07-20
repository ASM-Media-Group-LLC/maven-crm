-- Los DMs al número del bot (instancia 'maven-bot': Jhon/Álvaro ↔ bot) quedaban
-- department='closer' porque la instancia no estaba registrada en wa_channels
-- (channel_id null → fallback 'closer' del ingest) → Miguel (Closer Supervisor)
-- los veía vía la visibilidad por departamento (#893/#898).
--
-- Fix: registrar 'maven-bot' como canal department='manager' (active=false → no
-- entra al ruteo de salida: wa-inbox-open exige channel_id explícito+membresía y
-- las tools del bot filtran active=true; el ingest NO filtra active → sí clasifica
-- la entrada). Luego linkear+re-etiquetar sus conversaciones existentes: el
-- lookup del ingest (contact+dept+channel_id) las encuentra → sin duplicados.
-- Aplicada en prod el 2026-07-18. Idempotente.

insert into public.wa_channels (tenant_id, evolution_instance, label, department, active)
select (select tenant_id from public.wa_conversations where channel_jid='maven-bot' limit 1),
       'maven-bot', 'Maven Bot', 'manager', false
where not exists (select 1 from public.wa_channels where evolution_instance='maven-bot');

update public.wa_conversations c
set channel_id = ch.id, department = ch.department
from public.wa_channels ch
where ch.evolution_instance = 'maven-bot'
  and c.channel_jid = 'maven-bot'
  and (c.channel_id is distinct from ch.id or c.department is distinct from ch.department);
