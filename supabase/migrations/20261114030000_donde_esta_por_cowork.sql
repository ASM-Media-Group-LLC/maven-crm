-- «DÓNDE ESTÁ» AGRUPA POR EL COWORK DE CADA PERSONA (Alvaro, 13/11/2026).
-- Desde que hay un Cowork por departamento (20261113220000), el tablero seguía
-- agrupando por el rol (equipo_de): salían «Otros» (los de FREELANCE) y «Finanzas»
-- (ahora CONTABILIDAD). El equipo que devuelve donde_esta_cada_uno() pasa a ser el
-- Cowork donde la persona trabaja (su membresía de participante en una sesión activa),
-- y solo si no tiene, el de su rol. Se re-crea desde su definición actual cambiando
-- solo esa columna.
do $$
declare
  d text := pg_get_functiondef('public.donde_esta_cada_uno()'::regprocedure);
  nuevo text := $q$coalesce((select case s.name when 'CHATTERS KASH' then 'Chatters' when 'RR. HH.' then 'RR. HH.'
                                        when 'PR' then 'PR' when 'QA' then 'QA' else initcap(lower(s.name)) end
                     from public.cowork_memberships cm
                     join public.cowork_sessions s on s.id = cm.session_id and s.status = 'active'
                    where cm.user_id = g.id and cm.role <> 'host'
                    order by cm.joined_at desc limit 1),
                  public.equipo_de(g.id)),$q$;
begin
  if position('public.equipo_de(g.id),' in d) = 0 then
    raise exception 'donde_esta_cada_uno cambió: no encuentro la columna del equipo';
  end if;
  execute replace(d, 'public.equipo_de(g.id),', nuevo);
end
$$;
