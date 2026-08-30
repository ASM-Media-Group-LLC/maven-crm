-- Llamados de atención de Cowork: cámara apagada, mal encuadre, sin luz, sin
-- compartir pantalla. Hasta ahora estos avisos se le decían a la persona por voz
-- y aparecían en la pantalla del supervisor, pero NO quedaban en ningún lado: al
-- cerrar la pestaña se perdían.
--
-- ⚠️ POR AHORA ESTO NO AFECTA NINGUNA NOTA. Antes de que reste hay que mirar
-- unas semanas de datos reales: el detector de encuadre estuvo roto una semana
-- entera sin que nadie lo notara, y estrenar un castigo sobre datos así sería
-- sancionar gente por bugs nuestros.
--
-- QUÉ NO VA ACÁ: pasarse del tiempo de break o de baño. Eso ya se puede
-- calcular exactamente con `cowork_breaks` + `cowork_break_limits`, sin
-- depender de que el navegador de nadie lo reporte. Duplicarlo acá sería
-- guardar dos versiones de la misma verdad, y tarde o temprano difieren.
--
-- NOTA DE HISTORIAL: en producción esto entró en cuatro pasos (tras dos
-- revisiones adversariales). Este archivo es el estado FINAL, escrito para
-- poder correrse de nuevo sin romper: sirve para levantar el esquema desde
-- cero en otro entorno.
create table if not exists public.cowork_llamados (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.cowork_sessions(id) on delete cascade,
  room_id     uuid,
  user_id     uuid not null,

  -- 'camara'   la tenía apagada sin marcarse en pausa
  -- 'encuadre' no se le veía la cara, o estaba muy lejos / cortado
  -- 'luz'      demasiado oscuro para distinguir nada
  -- 'pantalla' no estaba compartiendo pantalla
  kind        text not null check (kind in ('camara','encuadre','luz','pantalla')),

  -- Qué episodio es. Lo sortea el navegador al arrancar su reloj y lo repite
  -- mientras el problema siga, así el servidor sabe que una escritura estira un
  -- llamado que ya existe en vez de abrir otro.
  --
  -- Antes esto se resolvía redondeando el inicio al minuto y usándolo como
  -- identidad. No alcanzaba: el cliente trunca los segundos a entero, así que
  -- la resta se movía casi un segundo entre llamadas y de vez en cuando cruzaba
  -- el borde del minuto. Sobre 20.000 episodios simulados, 1-2% quedaban
  -- partidos en dos filas que además seguían creciendo las dos — o sea que
  -- sumar duraciones contaba el episodio dos veces.
  nonce       text not null,

  -- El estado crudo del detector ('no_face', 'too_small', 'too_dark'…), para no
  -- perder el detalle al agrupar en cuatro categorías. Se conserva el PRIMERO:
  -- ver el trigger.
  detail      text,

  -- Cuándo EMPEZÓ el problema, no cuándo se registró. La fila recién se escribe
  -- al superar el umbral, y anotar la hora de escritura borraría los minutos
  -- que el problema ya llevaba.
  --
  -- Lo calcula el SERVIDOR restando la duración que reporta el cliente: si se
  -- aceptara una fecha absoluta, un reloj desviado la correría en cada llamada.
  started_at  timestamptz not null,

  seconds     integer not null default 0 check (seconds >= 0),

  -- Día de Bogotá, que es con el que trabaja el resto del sistema de notas.
  -- Calculado, no escrito: que nadie pueda mandar un día que no corresponde.
  day         date generated always as (((started_at at time zone 'America/Bogota'))::date) stored,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Por si la tabla ya existía de una versión anterior, sin `nonce`.
alter table public.cowork_llamados add column if not exists nonce text;
update public.cowork_llamados set nonce = id::text where nonce is null;
alter table public.cowork_llamados alter column nonce set not null;

-- Idempotencia de las escrituras: el mismo episodio se reporta muchas veces
-- para ir estirando `seconds`. Sin esto, un rato largo sin cámara se vería como
-- veinte llamados.
create unique index if not exists cowork_llamados_unico
  on public.cowork_llamados (user_id, kind, nonce);

-- Para la consulta que va a usar la nota: los llamados de una persona en un día.
create index if not exists cowork_llamados_persona_dia
  on public.cowork_llamados (user_id, day);

create index if not exists cowork_llamados_sesion
  on public.cowork_llamados (session_id);

alter table public.cowork_llamados enable row level security;

-- Mismo criterio que las pausas: cada quien ve lo suyo, el anfitrión ve lo de su
-- sesión, y supervisión ve todo.
drop policy if exists "Propios llamados" on public.cowork_llamados;
create policy "Propios llamados"
  on public.cowork_llamados for select
  using (user_id = auth.uid());

drop policy if exists "Anfitriones ven los de su sesion" on public.cowork_llamados;
create policy "Anfitriones ven los de su sesion"
  on public.cowork_llamados for select
  using (is_cowork_host(auth.uid(), session_id));

drop policy if exists "Supervisores ven todos" on public.cowork_llamados;
create policy "Supervisores ven todos"
  on public.cowork_llamados for select
  using (is_in_role_group(auth.uid(), 'supervisor_or_above'));

-- Escribe SOLO el edge con service_role. Doble candado a propósito: ninguna
-- política de escritura, y además REVOKE. Si la seguridad dependiera solo de la
-- ausencia de políticas, cualquier `FOR ALL` que alguien agregue después abriría
-- la escritura de golpe — y esto va a terminar afectando la nota de la gente.
-- TRUNCATE va incluido porque ignora RLS por completo.
revoke insert, update, delete, truncate on public.cowork_llamados from authenticated, anon;

-- Un llamado nunca se hace más corto, su origen no se reescribe, y su identidad
-- no se corrige por UPDATE.
create or replace function public.cowork_llamados_no_encoger()
returns trigger
language plpgsql
as $$
begin
  -- Las escrituras que estiran un llamado pueden llegar desordenadas; una vieja
  -- pisando a una nueva convertiría veinte minutos sin cámara en tres.
  new.seconds := greatest(coalesce(new.seconds, 0), coalesce(old.seconds, 0));
  new.updated_at := now();

  -- Todo lo que describe el ORIGEN queda como se escribió la primera vez. Lo
  -- único que avanza es la duración.
  --
  -- `started_at`: el servidor lo recalcula en cada escritura y se mueve un
  --   segundo; vale el primero.
  -- `session_id`/`room_id`: el llamado pertenece a la sala donde EMPEZÓ. Como
  --   la política de anfitriones cuelga de session_id, reatribuirlo cambiaría
  --   en silencio quién puede ver la fila.
  -- `detail`: el sub-estado que lo originó. Como un episodio de "encuadre"
  --   abarca `no_face` y `too_small`, sin esto el último parpadeo pisaba al
  --   motivo real.
  new.started_at := old.started_at;
  new.session_id := old.session_id;
  new.room_id    := coalesce(old.room_id, new.room_id);
  new.detail     := coalesce(old.detail, new.detail);
  new.created_at := old.created_at;

  if new.user_id is distinct from old.user_id
     or new.kind is distinct from old.kind
     or new.nonce is distinct from old.nonce then
    raise exception
      'cowork_llamados: user_id/kind/nonce identifican el llamado y no se cambian por UPDATE (era %/%/%, llegó %/%/%)',
      old.user_id, old.kind, old.nonce, new.user_id, new.kind, new.nonce;
  end if;

  return new;
end;
$$;

drop trigger if exists cowork_llamados_no_encoger on public.cowork_llamados;
create trigger cowork_llamados_no_encoger
  before update on public.cowork_llamados
  for each row execute function public.cowork_llamados_no_encoger();

comment on table public.cowork_llamados is
  'Llamados de atención de Cowork (cámara, encuadre, luz, pantalla). Solo registro: todavía no afecta la nota. Escribe únicamente cowork-session con service_role; el resto tiene REVOKE de escritura. El edge descarta cualquier llamado que se solape con una pausa registrada.';
