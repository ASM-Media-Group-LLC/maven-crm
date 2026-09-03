-- Cuántas visitas siguen llegando por el dominio histórico y a qué rutas.
--
-- Existe para poder APAGAR `maven.asmtech.ai` con datos en vez de "por si
-- acaso": si en 60 días no entró nadie, se borra tranquilo; si todavía caen
-- candidatos en /chatter/… o invitados en /entrar/…, ya se sabe por qué
-- conviene dejarlo redirigiendo.
--
-- Se guarda lo mínimo: host, ruta y fecha. NADA que identifique personas —
-- buena parte de estas visitas son de gente ajena a la empresa (candidatos,
-- invitados a reuniones), así que no hay user_id ni user agent ni IP. La ruta
-- llega sin query ni hash para no arrastrar los tokens de los enlaces.
create table if not exists public.dominio_legacy_visitas (
  id          bigserial primary key,
  host        text not null,
  ruta        text not null,
  visto_el    timestamptz not null default now()
);

create index if not exists dominio_legacy_visitas_fecha_idx
  on public.dominio_legacy_visitas (visto_el desc);

alter table public.dominio_legacy_visitas enable row level security;

-- Solo la edge function (service_role) escribe. Lectura: admins.
drop policy if exists dlv_lectura_admin on public.dominio_legacy_visitas;
create policy dlv_lectura_admin on public.dominio_legacy_visitas
  for select to authenticated
  using (public.is_in_role_group(auth.uid(), 'admin'));

-- Resumen listo para decidir: por ruta, con los días que lleva sin visitas.
create or replace view public.v_dominio_legacy_resumen as
select host,
       ruta,
       count(*)                            visitas,
       max(visto_el)                       ultima,
       (now()::date - max(visto_el)::date) dias_sin_visitas
from public.dominio_legacy_visitas
group by host, ruta
order by count(*) desc;
