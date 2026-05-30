-- Phone masking — FOUNDATION (additive, non-breaking)
-- Objetivo: que el número de teléfono de las creadoras solo sea visible para
-- ADMIN. El resto de los roles ve solo los últimos 4 dígitos. El número crudo
-- no debe llegar al browser de un no-admin (enforcement server-side, por tabla,
-- en migraciones siguientes).
--
-- Esta migración SOLO crea funciones helper. No revoca nada ni cambia tablas,
-- así que es segura de aplicar sola.

-- mask_phone: devuelve solo los últimos 4 dígitos, el resto como '•'.
-- Espejo en SQL del maskPhone() que ya existe en el front (lib/country-utils.ts).
create or replace function public.mask_phone(p text)
returns text
language sql
immutable
as $$
  select case
    when p is null then null
    when length(regexp_replace(p, '[^0-9]', '', 'g')) <= 4 then repeat(chr(8226), 4)
    else repeat(chr(8226), length(regexp_replace(p, '[^0-9]', '', 'g')) - 4)
         || right(regexp_replace(p, '[^0-9]', '', 'g'), 4)
  end;
$$;

-- is_phone_privileged: TRUE si el caller puede ver teléfonos completos.
-- Decisión del owner: SOLO admin. (Los closers contactan via Whaticket, sin ver
-- el número.) service_role siempre TRUE → las edge functions / el bot no se ven
-- afectados.
create or replace function public.is_phone_privileged()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role',
      false
    )
    or exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    );
$$;

comment on function public.mask_phone(text) is
  'Devuelve un teléfono enmascarado: solo los últimos 4 dígitos visibles.';
comment on function public.is_phone_privileged() is
  'TRUE si el usuario actual puede ver teléfonos completos (admin) o es service_role. Usado por las vistas/RPC de masking de teléfonos de creadoras.';

grant execute on function public.mask_phone(text) to authenticated, anon, service_role;
grant execute on function public.is_phone_privileged() to authenticated, anon, service_role;
