-- LO QUE ARGOS LE DIJO (Alvaro, 27/11/2026: «ese warning de qué fue… cuando el
-- robot le habla, le dice por qué es. Y yo no lo puedo ver»). Hasta hoy cada
-- episodio guardaba solo el motivo corto («Tenía la cámara apagada»); la frase
-- hablada rota y no quedaba. Ahora cada llamado de un episodio suma su frase.
--   · argos_nudges.frases: las frases que Argos le dijo, en orden.
--   · argos_nudge_registrar(_tipo, _mensaje, _frase): abre el episodio o, si ya
--     hay uno abierto del mismo tipo, le suma la frase. Corre como la persona
--     (security invoker): la RLS argos_nudges_rw_propio ya la deja escribir lo suyo.
alter table public.argos_nudges add column if not exists frases text[] not null default '{}';

create or replace function public.argos_nudge_registrar(_tipo text, _mensaje text, _frase text)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  yo uuid := (select auth.uid());
  frase text := nullif(btrim(coalesce(_frase, '')), '');
begin
  if yo is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  update public.argos_nudges
     set frases = case when frase is null then frases else array_append(frases, left(frase, 300)) end
   where user_id = yo and tipo = _tipo and cerrado_at is null;
  if found then return; end if;
  insert into public.argos_nudges (user_id, tipo, mensaje, avisado_at, frases)
  values (yo, _tipo, _mensaje, now(), case when frase is null then '{}'::text[] else array[left(frase, 300)] end)
  on conflict do nothing;
end
$function$;
revoke all on function public.argos_nudge_registrar(text, text, text) from public, anon;
grant execute on function public.argos_nudge_registrar(text, text, text) to authenticated;

-- QUIEN NO DEBE ESTAR EN COWORK, SIN HORARIO (Alvaro, 27/11/2026: «sin horario por
-- ahora, solo marcar conexión como clock in y out»). Para Argos → Turno: de una
-- lista de gente, quiénes no deben estar en Cowork (debe_estar_en_cowork = false:
-- dueño, admins, Finanzas, Freelance…). Solo de quien se puede vigilar.
create or replace function public.argos_sin_cowork_de(_ids uuid[])
returns table (user_id uuid)
language sql
stable security definer
set search_path to 'public'
as $function$
  select u.id from unnest(_ids) as u(id)
   where public.puede_vigilar(u.id) and not public.debe_estar_en_cowork(u.id);
$function$;
revoke all on function public.argos_sin_cowork_de(uuid[]) from public, anon;
grant execute on function public.argos_sin_cowork_de(uuid[]) to authenticated;
