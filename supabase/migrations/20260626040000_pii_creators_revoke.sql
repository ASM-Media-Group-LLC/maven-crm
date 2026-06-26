-- REVOKE column-level de la PII de creators (phone/phone_e164/whatsapp_number/email).
-- Se aplica a la DB SOLO DESPUÉS de que el frontend que lee v_creators esté deployado
-- (si no, rompe Creadoras + Finanzas con "permission denied for column"). El grant
-- table-level NO incluye las 4 PII; INSERT/UPDATE de PII NO se revoca (managers registran/
-- editan sin verlo; el front dropea valores con "•" vía stripMaskedPii). Lista de columnas
-- no-PII generada dinámicamente para que sea EXACTA.
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema='public' and table_name='creators'
    and column_name not in ('phone','phone_e164','whatsapp_number','email');
  execute 'revoke select on public.creators from authenticated, anon';
  execute format('grant select (%s) on public.creators to authenticated', cols);
end $$;
notify pgrst, 'reload schema';
