-- Dar de baja a alguien no le tocaba la credencial de correo.
--
-- `profiles.deleted_at` marcaba a la persona, pero `mail_credentials` quedaba
-- intacta, y el worker de mail-sync lee las credenciales con
-- `revoked_at is null`: seguía intentando entrar a ese buzón PARA SIEMPRE. Si
-- además le habían borrado el buzón en Zoho, quedaba un `sync: Command failed`
-- eterno — y los logins fallidos son justo lo que Zoho castiga con tarpit, así
-- que una casilla dada de baja le hacía daño a las 59 que sí andan.
--
-- Encontrado el 16/09/2026 con 5 casillas colgadas: hh.rr@ (baja 11/09),
-- jordin.vanegas@ y tatiana.vargas@ (09/09) ya fallando, y manuela.zapata@
-- (14/09) y santiago.valencia@ (15/09) todavía sincronizando correo de gente
-- que ya no está.
--
-- Se cierra en la BASE y no en el código de la baja a propósito: así vale para
-- cualquier camino que marque `deleted_at` (la UI, un script, SQL a mano), que
-- es lo que falló la primera vez.

create or replace function public.revocar_correo_al_dar_de_baja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo en la TRANSICIÓN a dado de baja. Sin esto, cualquier update sobre una
  -- fila ya borrada volvería a pisar `revoked_at` y se perdería la fecha real
  -- de cuándo se cortó.
  update public.mail_credentials
     set revoked_at = now()
   where user_id = new.id
     and revoked_at is null;
  return new;
end;
$$;

comment on function public.revocar_correo_al_dar_de_baja() is
  'Al marcar profiles.deleted_at, corta el sync IMAP de esa persona. No borra '
  'mail_messages: lo ya guardado se conserva. Es reversible poniendo '
  'revoked_at = null (refrescarCuentas() la vuelve a tomar sin redesplegar).';

drop trigger if exists profiles_baja_revoca_correo on public.profiles;

-- AFTER: la fila ya quedó marcada. Si esto fuera BEFORE y algo más abortara el
-- update, habríamos revocado el correo de alguien que sigue trabajando.
-- El WHEN acota a la transición NULL -> no NULL; un restore (volver a NULL) NO
-- des-revoca solo, a propósito: si alguien vuelve, que se reconecte la casilla
-- en vez de resucitar una credencial en silencio.
create trigger profiles_baja_revoca_correo
  after update of deleted_at on public.profiles
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.revocar_correo_al_dar_de_baja();

-- Las que ya estaban colgadas cuando esto no existía. Idempotente.
update public.mail_credentials c
   set revoked_at = now()
  from public.profiles p
 where p.id = c.user_id
   and p.deleted_at is not null
   and c.revoked_at is null;
