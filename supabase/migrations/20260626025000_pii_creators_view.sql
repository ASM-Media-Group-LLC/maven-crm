-- PII admin-only para creators (phone/phone_e164/whatsapp_number/email): vista enmascarada.
-- Mismo patrón que closers_contacts/scouter_leads. creators tiene RLS SELECT efectiva = true
-- (policy "Authenticated users can view creators" qual=true OR-eada con creators_scope_select),
-- así que la vista definer NO necesita filtro de tenant/scope HOY. CAVEAT: si algún día se elimina
-- la policy qual=true, habría que reponer la condición de creators_scope_select en el WHERE.
-- Construimos la lista de columnas dinámicamente para que las 122 no-PII sean EXACTAS y en orden.
-- OJO anon: ver 20260626030000 — revoke anon+public (el default-privilege de Supabase mete a anon).
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema='public' and table_name='creators'
    and column_name not in ('phone','phone_e164','whatsapp_number','email');
  execute format($f$
    create or replace view public.v_creators as
    select %s,
      case when public.is_phone_privileged() then phone           else public.mask_phone(phone)           end as phone,
      case when public.is_phone_privileged() then phone_e164      else public.mask_phone(phone_e164)      end as phone_e164,
      case when public.is_phone_privileged() then whatsapp_number else public.mask_phone(whatsapp_number) end as whatsapp_number,
      case when public.is_phone_privileged() then email           else public.mask_email(email)           end as email
    from public.creators
  $f$, cols);
end $$;

grant select on public.v_creators to authenticated;
revoke select on public.v_creators from anon, public;
notify pgrst, 'reload schema';
