-- Lectura del Messenger por API: lo que la base tiene que poner.
--
-- 1. messenger_unread_counts(): los no leídos de la persona de la sesión, con tope.
--    La de la app (get_unread_counts) cuesta 2.838 bloques para el CEO y 11.868
--    para la persona con más mensajes, y es la consulta #1 de la base; reescrita
--    con la RLS (SECURITY INVOKER) es PEOR: 43.576 bloques, porque la RLS deja a
--    created_at fuera del índice. Esta, DEFINER y con tope de 101 por conversación,
--    mide 383 bloques / 1,6 ms para la peor persona (medido en prod el 25/09).
--    ⚠️ Como es DEFINER, su cuerpo ES la pared: no recibe NINGÚN id, usa solo
--    auth.uid(), y anon no la puede llamar. Sin sesión, no devuelve nada.
--
-- 2. api_keys_reglas_messenger: las reglas que decidió Jhon el 25/09 para las
--    llaves que leen el Messenger, en la base, para que valgan aunque alguien
--    saltee manage-api-keys:
--      * al crear: IPs EXACTAS (sin rangos: 0.0.0.0/0 deja entrar a todos) y
--        vencimiento en el futuro y a 90 días como máximo;
--      * al editar: no se le puede SUMAR el permiso a una llave que no lo tenía (las
--        3 de hoy actúan como el CEO), y a una que lo tiene no se le pueden sacar
--        las IPs ni extender el vencimiento.
--    Solo mira scopes, ip_whitelist y expires_at: no se dispara con la escritura de
--    cada pedido (api_key_consumir) ni al revocar.

set local lock_timeout = '3s';

-- ─── 1. no leídos, baratos y solo propios ─────────────────────────────────────

create or replace function public.messenger_unread_counts()
returns table (conversation_id uuid, unread_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select cp.conversation_id, u.n::integer
    from public.chat_participants cp
   cross join lateral (
     select count(*) as n
       from (select 1
               from public.chat_messages cm
              where cm.conversation_id = cp.conversation_id
                and cm.created_at > coalesce(cp.last_read_at, '-infinity'::timestamptz)
                and cm.sender_id <> cp.user_id
                and not cm.is_deleted
              limit 101) x
   ) u
   where cp.user_id = (select auth.uid());
$$;

revoke all on function public.messenger_unread_counts() from public, anon;
grant execute on function public.messenger_unread_counts() to authenticated, service_role;

-- ─── 2. reglas de las llaves con Messenger ────────────────────────────────────

create or replace function public.api_keys_reglas_messenger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _tiene boolean := exists (select 1 from unnest(new.scopes) s where s like 'messenger:%');
  _tenia boolean := tg_op = 'UPDATE' and exists (select 1 from unnest(old.scopes) s where s like 'messenger:%');
begin
  if not _tiene then
    return new;
  end if;
  if tg_op = 'UPDATE' and not _tenia then
    raise exception 'api_keys: el permiso de Messenger solo se puede poner al crear una llave nueva';
  end if;
  if coalesce(cardinality(new.ip_whitelist), 0) = 0 then
    raise exception 'api_keys: una llave con Messenger necesita IPs fijas';
  end if;
  if exists (select 1 from unnest(new.ip_whitelist) ip where ip like '%/%') then
    raise exception 'api_keys: una llave con Messenger va con IPs exactas, sin rangos';
  end if;
  if new.expires_at is null then
    raise exception 'api_keys: una llave con Messenger necesita fecha de vencimiento';
  end if;
  if tg_op = 'INSERT' and (new.expires_at <= now() or new.expires_at > now() + interval '90 days') then
    raise exception 'api_keys: una llave con Messenger vence en el futuro y a 90 días como máximo';
  end if;
  if tg_op = 'UPDATE' and new.expires_at > old.expires_at then
    raise exception 'api_keys: a una llave con Messenger no se le extiende el vencimiento; creá otra';
  end if;
  return new;
end;
$$;

revoke all on function public.api_keys_reglas_messenger() from public, anon, authenticated;

drop trigger if exists api_keys_reglas_messenger on public.api_keys;
create trigger api_keys_reglas_messenger
  before insert or update of scopes, ip_whitelist, expires_at on public.api_keys
  for each row execute function public.api_keys_reglas_messenger();
