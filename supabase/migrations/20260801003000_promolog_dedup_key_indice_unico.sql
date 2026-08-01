-- Promolog reinsertaba las mismas filas en cada corrida.
--
-- La deduplicación era de aplicación ("buscá antes de insertar") y encima condicional:
--
--     if (p.permalink) { ...buscar duplicado... }     ← sin permalink NI SE EJECUTA
--
-- Los canales privados de Telegram no tienen permalink público, así que la clave
-- venía nula, el chequeo se salteaba entero y la fila entraba de nuevo. En X era
-- peor: comparaba `.eq("story_link_url", null)` y en SQL nada es igual a NULL, así
-- que nunca encontraba el duplicado. Y los marcadores diarios ("sin actividad") se
-- chequeaban contra el día en UTC: pasadas las 19:00 de Bogotá eso ya es MAÑANA, no
-- encontraban el marcador del día y lo reinsertaban en cada corrida.
--
-- Aparte, el agente local FABRICABA el permalink (se quedaba con los últimos 6
-- dígitos del data-mid de Telegram Web), así que el mismo post leído por el gateway
-- y por el local producía dos claves distintas y entraba dos veces.
--
-- El arreglo no es más código de aplicación: es que la BASE lo impida. Con este
-- índice, un scraper con bug puede reintentar lo que quiera y la fila no entra dos
-- veces. Además elimina la carrera: dos corridas simultáneas ya no pasan las dos
-- por un "no existe" antes de que ninguna haya insertado.
--
-- `dia` va en la clave a propósito: es columna generada con el día de Bogotá, y
-- promolog responde "¿promocionó tal día?". Así una historia que cruza la medianoche
-- puede existir en los dos días sin que sea un conflicto.

alter table promolog_entries add column if not exists dedup_key text;

comment on column promolog_entries.dedup_key is
  'Identidad del post para no reinsertarlo. IG=story_pk · Telegram/X/FB=permalink canónico · marcador diario="sinact". Lo garantiza el índice promolog_entries_dedup_uk, no el código.';

-- Relleno con la clave que cada red YA venía usando, pero solo en la primera fila de
-- cada grupo: las repetidas históricas quedan con dedup_key nulo para no borrar nada
-- (el índice es parcial y las ignora).
with k as (
  select id, tenant_id, creator_id, network, dia, created_at,
         case network when 'instagram' then story_pk
                      when 'telegram'  then evidence_url
                      when 'x'         then story_link_url end as clave
  from promolog_entries
), r as (
  select id, clave,
         row_number() over (partition by tenant_id, creator_id, network, dia, clave
                            order by created_at, id) as rn
  from k where clave is not null
)
update promolog_entries e set dedup_key = r.clave
from r where r.id = e.id and r.rn = 1;

create unique index if not exists promolog_entries_dedup_uk
  on promolog_entries (tenant_id, creator_id, network, dia, dedup_key)
  where dedup_key is not null;
