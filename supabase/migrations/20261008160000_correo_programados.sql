-- CORREOS PROGRAMADOS: «Programar envío», como Gmail (Keila, 08/10/2026).
-- Banco: supabase/tests/correo_programados.ts. El envío: mail-fetch/programados.ts.
--
-- La flecha al lado de «Enviar» guarda el correo acá con su hora, y un cron lo
-- manda cuando llega (mail-fetch, con X-Cron-Token: ver la migración del cron).
-- Sale por el MISMO camino que el botón Enviar (mail-fetch/enviar.ts): la misma
-- revisión, la copia en Enviados y las menciones.
--
-- Vive en Maven y no en el servidor de correo: la carpeta «Programados» del
-- Correo lee esta tabla. Mientras espera, el correo entero (con sus adjuntos,
-- hasta 20 MB) está en `correo`; al salir se vacía.
--
-- QUIÉN TOCA QUÉ:
--   · la persona VE sus programados (solo las columnas de la lista, nunca el
--     correo entero) y los CANCELA con mail_programado_cancelar(), que le
--     devuelve el contenido para seguir editándolo;
--   · los crea la edge (revisa el correo antes de guardarlo) y los manda la
--     edge, que los toma con mail_programados_tomar().
--
-- Vuelta atrás (las líneas «--|»; el banco las corre):
--| drop function public.mail_programado_cancelar(uuid);
--| drop function public.mail_programados_tomar(integer);
--| drop table public.mail_programados;

create table public.mail_programados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  enviar_en timestamptz not null,
  estado text not null default 'pendiente',
  -- Lo que muestra la lista «Programados». El correo entero no hace falta para
  -- eso, y son hasta 27 MB por fila.
  para text[] not null,
  cc text[] not null default '{}',
  cco text[] not null default '{}',
  asunto text not null default '',
  resumen text not null default '',
  -- Los archivos adjuntos (no las imágenes pegadas): {filename, contentType, sizeBytes}.
  adjuntos_meta jsonb not null default '[]'::jsonb,
  -- El correo tal cual se mandaría: {text, html, in_reply_to, references,
  -- attachments, menciones}. Se vacía al salir.
  correo jsonb not null,
  intentos smallint not null default 0,
  ultimo_error text,
  creado_en timestamptz not null default now(),
  tomado_en timestamptz,
  cerrado_en timestamptz,
  constraint mail_programados_estado check (estado in ('pendiente', 'enviando', 'enviado', 'fallido', 'cancelado')),
  constraint mail_programados_para check (cardinality(para) > 0)
);
-- Lo único que mira el cron cada minuto: chico porque solo indexa los que esperan.
create index mail_programados_vencen_idx on public.mail_programados (enviar_en) where estado = 'pendiente';
create index mail_programados_persona_idx on public.mail_programados (user_id, enviar_en);
comment on table public.mail_programados is
  'Correos programados («Programar envío» del Correo). Los crea y los manda la edge mail-fetch; la persona ve la lista y cancela. Ver 20261008160000.';

alter table public.mail_programados enable row level security;
revoke all on table public.mail_programados from public, anon, authenticated;
-- La lista, y nada más: el correo entero (y sus adjuntos) no viaja a la pantalla
-- por acá. Para editarlo se cancela (abajo), que lo devuelve.
grant select (id, user_id, enviar_en, estado, para, cc, cco, asunto, resumen, adjuntos_meta, ultimo_error, creado_en)
  on table public.mail_programados to authenticated;
create policy mail_programados_los_mios on public.mail_programados
  for select to authenticated
  using (user_id = (select auth.uid()));
grant select, insert, update, delete on table public.mail_programados to service_role;

-- ─── El cron toma los que ya tienen que salir ───────────────────────────────
-- Los marca «enviando» en la MISMA sentencia que los elige, con SKIP LOCKED:
-- dos corridas que se pisan nunca toman el mismo, así que un correo no puede
-- salir dos veces por esto.
create function public.mail_programados_tomar(p_limite integer default 20)
returns setof public.mail_programados
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- ⚠️ Uno que quedó «enviando» más de 15 minutos es una función que se murió a
  -- mitad de camino: PUEDE haber salido. No se reintenta solo (un correo
  -- duplicado a un cliente es peor que uno que no salió); se marca fallido para
  -- que la persona mire Enviados y decida.
  update public.mail_programados
     set estado = 'fallido',
         ultimo_error = 'se cortó mientras salía: revisa Enviados antes de volver a mandarlo',
         cerrado_en = now()
   where estado = 'enviando' and tomado_en < now() - interval '15 minutes';

  -- Lo que ya cumplió no se guarda para siempre. Un cancelado todavía tiene el
  -- correo entero (se le devolvió a la persona para editarlo; si esa respuesta
  -- se perdió, el contenido sigue acá): dos días y se va.
  delete from public.mail_programados
   where (estado = 'enviado' and cerrado_en < now() - interval '30 days')
      or (estado = 'cancelado' and cerrado_en < now() - interval '2 days');

  return query
  update public.mail_programados m
     set estado = 'enviando', tomado_en = now(), intentos = m.intentos + 1
   where m.id in (
     select p.id from public.mail_programados p
      where p.estado = 'pendiente' and p.enviar_en <= now()
      order by p.enviar_en
      limit greatest(1, least(coalesce(p_limite, 20), 50))
      for update skip locked
   )
  returning m.*;
end $$;
revoke all on function public.mail_programados_tomar(integer) from public, anon, authenticated;
grant execute on function public.mail_programados_tomar(integer) to service_role;

-- ─── La persona cancela (y se lleva el correo para seguir editándolo) ───────
-- Como «Cancelar envío» de Gmail: el correo no sale y vuelve a ser un borrador.
-- Devuelve el contenido entero, o null si ya no se puede (salió, está saliendo,
-- o no es suyo). Un fallido también se puede «cancelar»: es la forma de
-- recuperarlo para corregirlo y volver a mandarlo.
create function public.mail_programado_cancelar(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.mail_programados;
begin
  update public.mail_programados
     set estado = 'cancelado', cerrado_en = now()
   where id = p_id and user_id = (select auth.uid()) and estado in ('pendiente', 'fallido')
  returning * into r;
  if r.id is null then return null; end if;
  return jsonb_build_object(
    'id', r.id, 'para', r.para, 'cc', r.cc, 'cco', r.cco, 'asunto', r.asunto,
    'enviar_en', r.enviar_en, 'correo', r.correo
  );
end $$;
revoke all on function public.mail_programado_cancelar(uuid) from public, anon;
grant execute on function public.mail_programado_cancelar(uuid) to authenticated;
