-- Arregla el paso anterior: se reemplazaron los ARGUMENTOS del format (dos pasaron
-- a ser un CASE) pero no el literal, que seguía con 7 huecos para 6 argumentos
-- → "too few arguments for format()". El texto "creadoras para empujar (N críticas)"
-- ahora lo arma el propio CASE, así que sale del literal.
--
-- ⚠️ Lección para la próxima cirugía sobre un format(): los huecos y los argumentos
-- viven en DOS lugares del texto. Cambiar uno solo compila y revienta en runtime.
do $mig$
declare
  def text;
  lit_viejo constant text :=
    'format(''· *%s*: %s creadoras para empujar (%s críticas) · %s con 3+ días sin contacto%s · %s contactadas hoy%s'',';
  lit_nuevo constant text :=
    'format(''· *%s*: %s · %s con 3+ días sin contacto%s · %s contactadas hoy%s'',';
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'alvaro_pulse';

  if position(lit_viejo in def) = 0 then
    raise exception 'no encontré el literal del format de managers (¿ya estaba arreglado?)';
  end if;

  def := replace(def, lit_viejo, lit_nuevo);
  execute def;
end
$mig$;
