-- Maven leía UNA sola agencia de BLU.
--
-- La sesión guardada es la de `jhon.j.lopez@unlok.me` (accountId 4) = PLUS. La
-- otra empresa, MASSIVE, es otra cuenta de BLU con otro login (`+1@`), y BLU
-- ata cada sesión a una cuenta: ser admin da todo DENTRO de la cuenta, pero no
-- deja saltar a la otra. Quien trabajaba en Massive aparecía con cero ventas.
-- Verificado con Alexandra Giraldo (46 h y $0 en Maven, $1.336,98 en Massive) y
-- Brenda Mina (37,7 h y $0, $1.851,09 en Massive).
--
-- Nada cambia de valor: todo lo que ya existe vino de Plus, así que ese es el
-- default en cada columna nueva.

-- Los ids de modelo NO son únicos entre agencias: el 38 de Plus y el 38 de
-- Massive pueden ser creadoras distintas. Sin la agencia en la clave, una fila
-- pisaría a la otra en silencio.
alter table public.chatter_model_daily
  add column if not exists agency text not null default 'plus';
alter table public.chatter_creator_assignment_daily
  add column if not exists agency text not null default 'plus';

alter table public.chatter_model_daily drop constraint if exists chatter_model_daily_pkey;
alter table public.chatter_model_daily
  add constraint chatter_model_daily_pkey primary key (dia, identity_id, agency, blu_model_id);

alter table public.chatter_creator_assignment_daily drop constraint if exists chatter_creator_assignment_daily_pkey;
alter table public.chatter_creator_assignment_daily
  add constraint chatter_creator_assignment_daily_pkey primary key (dia, identity_id, agency, blu_model_id);

-- Una persona puede tener cuenta en las DOS agencias y las dos cuentan para
-- ella: `localPart` ya recorta el `+1`, así que ambas caen en la misma
-- identidad de Maven y sus ventas se suman.
--
-- ⚠️ La agencia la define QUÉ SESIÓN devolvió la cuenta, NO el `+1` del correo.
-- Al escribir esto la etiqueté por el correo y quedó mal: hay gente de Plus con
-- correo `+1` (Manuela Zapata, Santiago Valencia).
alter table public.chatter_identity_link
  add column if not exists agency text;
update public.chatter_identity_link set agency = 'plus'
  where source = 'blu' and agency is distinct from 'plus';

drop index if exists chatter_identity_link_uno_vivo_por_agencia;
create unique index chatter_identity_link_uno_vivo_por_agencia
  on public.chatter_identity_link (identity_id, source, agency)
  where valid_to is null;

alter table public.chatter_model_daily_sync
  add column if not exists agency text not null default 'plus';
alter table public.chatter_model_daily_sync drop constraint if exists chatter_model_daily_sync_pkey;
alter table public.chatter_model_daily_sync
  add constraint chatter_model_daily_sync_pkey primary key (dia, agency, blu_model_id);

alter table public.blu_session
  add column if not exists agency text not null default 'plus';
update public.blu_session set agency = 'plus' where id = 1;

comment on column public.blu_session.agency is
  'De qué agencia es esta sesión. BLU ata cada token a UNA cuenta; no se puede saltar de agencia con el mismo token. La semilla sale de los secretos BLU_JWT (plus) y BLU_JWT_MASSIVE, y a partir de ahí el token fresco de cada respuesta se guarda acá.';

-- ── UNA SESIÓN POR AGENCIA ─────────────────────────────────────────────────
--
-- Al conectar Massive por primera vez no existía su fila y el código usó el
-- id 1 por defecto: la sesión de Massive PISÓ la de Plus. Las dos pasadas
-- terminaron leyendo la misma cuenta, los empleados de Massive entraron
-- etiquetados como Plus, y a cada persona se le dio de baja su enlace bueno.
-- Con la agencia como clave única el upsert no puede volver a colisionar.
alter table public.blu_session drop constraint if exists blu_session_agency_key;
alter table public.blu_session add constraint blu_session_agency_key unique (agency);

-- ── `id` AUTONUMÉRICO (si no, la segunda sesión no entra nunca) ─────────────
--
-- `id` era la PK con DEFAULT 1 fijo, de cuando había una sola sesión. Con dos
-- agencias, el upsert por `agency` inserta sin id, toma el 1 y choca contra la
-- clave primaria. Y el upsert no comprobaba el error: fallaba MUDO.
--
-- Consecuencia: solo sobrevivía la fila de la primera agencia que escribiera y
-- el token de la otra no se persistía nunca. Cada consulta suya arrancaba del
-- secreto, y como el JWT de BLU dura 24 h, al vencer ese secreto esa agencia
-- entera se caía a cero. El mismo síntoma que tenía Alexandra, pero al revés y
-- para la mitad del equipo.
create sequence if not exists public.blu_session_id_seq owned by public.blu_session.id;
select setval('public.blu_session_id_seq', greatest(coalesce((select max(id) from public.blu_session), 0), 1));
alter table public.blu_session alter column id set default nextval('public.blu_session_id_seq');

comment on column public.blu_session.id is
  'Autonumérico. Antes tenía DEFAULT 1 fijo: con dos agencias el upsert chocaba contra la PK y la segunda sesión no se guardaba nunca. La identidad real de la fila es `agency`.';

-- ── La base de "lo esperado" también es por agencia ─────────────────────────
--
-- Se calculaba por id de modelo sin mirar la agencia. Hoy no mezcla porque los
-- ids de las dos empresas resultaron disjuntos, pero eso es suerte: el día que
-- BLU reuse un id, el esperado de una creadora se calcularía con las ventas de
-- otra.
create or replace function public.chatter_model_baseline(
  _blu_model_id bigint, _hasta date, _dias integer default 30, _agency text default null)
returns numeric language sql stable security definer set search_path to 'public'
as $function$
  WITH por_dia AS (
    SELECT c.dia, sum(c.sales) AS total_dia, count(DISTINCT c.identity_id) AS chatters_dia
    FROM public.chatter_model_daily c
    WHERE c.blu_model_id = _blu_model_id
      AND c.dia <= _hasta AND c.dia > _hasta - _dias
      AND (_agency IS NULL OR c.agency = _agency)
    GROUP BY c.dia
  )
  SELECT AVG(total_dia / GREATEST(1, chatters_dia)) FROM por_dia;
$function$;

create or replace function public.chatter_expected_sales(_identity uuid, _dia date, _dias integer default 30)
returns numeric language sql stable security definer set search_path to 'public'
as $function$
  SELECT SUM(public.chatter_model_baseline(c.blu_model_id, _dia, _dias, c.agency))
  FROM public.chatter_model_daily c
  WHERE c.identity_id = _identity AND c.dia = _dia;
$function$;
