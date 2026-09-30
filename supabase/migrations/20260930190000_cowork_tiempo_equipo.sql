-- QUÉ EQUIPO ESTIRÓ CADA TRAMO DEL RELOJ DE COWORK.
--
-- Hay un solo tramo abierto por persona. Con Cowork abierto en dos equipos (la
-- laptop que perdió el wifi y el teléfono al que se pasó a trabajar), los dos
-- laten y se pisaban el tramo: cada latido cerraba el del otro, cada tramo duraba
-- casi cero y el tiempo trabajado en el teléfono no sumaba mientras la laptop
-- siguiera abierta fuera de la sala. Con esta columna la edge sabe qué equipo
-- estiró el tramo abierto y puede ignorar al que quedó afuera
-- (supabase/functions/_shared/cowork-tiempo.ts, latidoDeEquipoAfuera).
--
-- ⚠️ ORDEN DE DESPLIEGUE: va ANTES del merge. La edge nueva LEE esta columna: si
-- saliera antes, fallarían todos los latidos. Es compatible con lo que corre hoy:
-- una columna nueva, nula, que nadie lee todavía. Agregar una columna nula sin
-- valor por defecto no reescribe la tabla.
set lock_timeout = '3s';

alter table public.cowork_tiempo_segmentos add column if not exists equipo text;

comment on column public.cowork_tiempo_segmentos.equipo is
  'Pestaña/equipo que estiró el tramo por última vez (id de sessionStorage del navegador). Null = versión anterior.';
