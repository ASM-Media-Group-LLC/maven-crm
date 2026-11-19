-- Alvaro (19/11/2026): una persona sin posición (p. ej. recién creada en Usuarios)
-- ya NO queda bloqueada al tocar Ajustes › Posiciones. Solo se bloquea a quien
-- está marcado «deshabilitada». Aplicada en producción el 19/11 por MCP.
do $$
declare
  d text;
  n text;
begin
  if to_regprocedure('public.posiciones_aplicar(boolean, boolean)') is null then
    raise notice 'posiciones_aplicar no existe: nada que cambiar';
    return;
  end if;
  d := pg_get_functiondef('public.posiciones_aplicar'::regproc);
  n := replace(d,
    E'      and (exists (select 1 from public.personas_borrador_marcas m where m.user_id = pr.id and m.deshabilitada)\n           or not exists (select 1 from public.posiciones_borrador_personas pp where pp.user_id = pr.id))',
    E'      and exists (select 1 from public.personas_borrador_marcas m where m.user_id = pr.id and m.deshabilitada)');
  if n <> d then
    execute n;
  end if;
end $$;
