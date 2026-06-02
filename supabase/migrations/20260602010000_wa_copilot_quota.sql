-- =============================================================================
-- Cuota diaria del copiloto IA del inbox (6a.3) — techo de costo por usuario.
-- -----------------------------------------------------------------------------
-- Cada uso del copiloto (✨ sugerir/resumir/señales) = 1 llamada a Claude = un
-- costo chico. Sin tope, a "libre demanda" × muchos closers el gasto se va.
-- Esta cuota pone el techo: X usos por persona por día.
--
--   límite efectivo = override del usuario  >  cuota del rol  >  default (20)
--   admin / manager_or_above = ILIMITADO.
--
-- El enforcement es server-side (wa-inbox-suggest llama wa_copilot_try_consume
-- ANTES de llamar a Claude). La tabla de uso también sirve de log.
-- =============================================================================

-- ── Contador diario por usuario ──────────────────────────────────────────────
create table if not exists public.wa_copilot_usage (
  user_id    uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,                 -- día local (Bogotá) del uso
  count      int  not null default 0,
  primary key (user_id, usage_date)
);
comment on table public.wa_copilot_usage is 'Usos del copiloto IA del inbox por usuario/día (cap de costo 6a.3 + log de uso).';

-- ── Config de cuota: default por rol + override por usuario ──────────────────
alter table public.roles_config add column if not exists ai_daily_quota int default 20;
comment on column public.roles_config.ai_daily_quota is 'Cuota diaria de usos del copiloto IA del inbox para este rol (default 20). admin/manager se tratan como ilimitado en wa_copilot_try_consume.';

alter table public.profiles add column if not exists ai_daily_quota_override int;
comment on column public.profiles.ai_daily_quota_override is 'Override de cuota diaria de IA para este usuario (gana sobre la del rol). NULL = usar la del rol.';

-- ── RLS de la tabla de uso ───────────────────────────────────────────────────
-- El usuario ve lo suyo; supervisor_or_above ve todo (auditar/medir). La
-- escritura la hace SOLO la función SECURITY DEFINER (no hay policy de write).
alter table public.wa_copilot_usage enable row level security;
create policy wa_copilot_usage_select on public.wa_copilot_usage
  for select to authenticated
  using (user_id = auth.uid() or public.is_in_role_group(auth.uid(), 'supervisor_or_above'));
grant select on public.wa_copilot_usage to authenticated;

-- ── try_consume: resuelve el límite, chequea y consume (1 uso) ───────────────
-- Devuelve (allowed, used, lim). lim NULL = ilimitado. Se llama con service_role
-- desde la edge function (pasa el _user_id ya validado por el JWT).
create or replace function public.wa_copilot_try_consume(_user_id uuid)
returns table(allowed boolean, used int, lim int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today     date := (now() at time zone 'America/Bogota')::date;
  v_lim       int;
  v_used      int;
  v_unlimited boolean := false;
begin
  -- admin / manager_or_above => ilimitado.
  if public.is_in_role_group(_user_id, 'manager_or_above') then
    v_unlimited := true;
  else
    -- override del usuario > cuota del rol > default 20.
    select p.ai_daily_quota_override into v_lim
      from public.profiles p where p.id = _user_id;
    if v_lim is null then
      select rc.ai_daily_quota into v_lim
        from public.user_roles ur
        join public.roles_config rc on rc.name = ur.role and rc.is_active
        where ur.user_id = _user_id
        limit 1;
    end if;
    v_lim := coalesce(v_lim, 20);
  end if;

  select count into v_used
    from public.wa_copilot_usage
    where user_id = _user_id and usage_date = v_today;
  v_used := coalesce(v_used, 0);

  -- Sin presupuesto → no consume, no permite.
  if not v_unlimited and v_used >= v_lim then
    return query select false, v_used, v_lim;
    return;
  end if;

  -- Consume 1 uso.
  insert into public.wa_copilot_usage (user_id, usage_date, count)
    values (_user_id, v_today, 1)
    on conflict (user_id, usage_date)
    do update set count = public.wa_copilot_usage.count + 1;

  return query select true, v_used + 1, case when v_unlimited then null else v_lim end;
end;
$$;
grant execute on function public.wa_copilot_try_consume(uuid) to service_role;
comment on function public.wa_copilot_try_consume(uuid) is
  'Cuota IA del inbox (6a.3): resuelve el límite (override usuario > rol > 20; admin/manager ilimitado), chequea el uso de hoy (Bogotá) y consume 1. Devuelve (allowed, used, lim). La llama wa-inbox-suggest con service_role.';
