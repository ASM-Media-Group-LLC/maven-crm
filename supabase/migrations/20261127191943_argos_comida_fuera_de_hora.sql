-- SHIFT: COMER FUERA DE LA HORA (27/11/2026). La hora de comida por plan de pausa
-- (PR 307, 20261127070000_hora_de_comida) trae comida_fuera_de_hora(_uid, _dia),
-- cerrada a la app. Alvaro eligió: si la hora es obligatoria y se sale del margen,
-- Argos lo anota como aviso amarillo, sin descontar. Esta función se lo da a la
-- tabla del turno para varias personas a la vez, solo de quien se puede vigilar.
-- null = sin hora o no salió a comer; 0 = cumplió o es solo recomendada; N = minutos fuera.
create or replace function public.argos_comida_fuera_de_hora(_ids uuid[], _dia date)
returns table (user_id uuid, minutos integer)
language sql
stable security definer
set search_path to 'public'
as $function$
  select u.id, public.comida_fuera_de_hora(u.id, _dia)
    from unnest(_ids) as u(id)
   where public.puede_vigilar(u.id);
$function$;
revoke all on function public.argos_comida_fuera_de_hora(uuid[], date) from public, anon;
grant execute on function public.argos_comida_fuera_de_hora(uuid[], date) to authenticated;
