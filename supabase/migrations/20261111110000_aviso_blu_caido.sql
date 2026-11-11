-- SI BLU SE DESCONECTA, EL DUEÑO SE ENTERA EL MISMO DÍA (11/11/2026).
--
-- Las dos sesiones de Blu (Plus y Massive) vencieron el 22/10 y los ingresos de
-- las modelos quedaron congelados en el 21/10 durante tres semanas. El puente
-- (infra/blu-bridge) lo anotaba en blu_bridge_state 'salud_sync' = {ok:false,
-- detalle:["plus: JWT vencido", …]}, pero nadie lo leía.
--
-- vigilar_blu: si 'salud_sync' dice ok=false Y el último ingreso guardado ya es
-- de antes de ayer (o sea, de verdad dejó de llegar data, no un intento suelto),
-- manda una campana a los dueños de la agencia (una cada 24 h como mucho) con
-- qué cuenta falló y qué hacer. Corre cada 30 minutos.

create table if not exists public.blu_avisos (
  id bigint generated always as identity primary key,
  creado timestamptz not null default now(),
  detalle jsonb
);
alter table public.blu_avisos enable row level security;

create or replace function public.vigilar_blu()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salud jsonb;
  v_detalle text;
  v_n int := 0;
begin
  select s.value::jsonb into v_salud
    from public.blu_bridge_state s where s.key = 'salud_sync';
  if v_salud is null or coalesce((v_salud->>'ok')::boolean, true) then
    return 0;
  end if;
  -- Ya se avisó en las últimas 24 h: no repetir.
  if exists (select 1 from public.blu_avisos a where a.creado > now() - interval '24 hours') then
    return 0;
  end if;
  -- Un intento fallido suelto no es una caída: solo se avisa si la data ya se
  -- quedó atrás (el último ingreso guardado es de antes de ayer).
  if (select max(e.date) from public.creator_daily_earnings e) >= (now() at time zone 'America/Bogota')::date - 1 then
    return 0;
  end if;

  v_detalle := coalesce((select string_agg(x, ', ') from jsonb_array_elements_text(v_salud->'detalle') x), 'sin detalle');

  insert into public.blu_avisos (detalle) values (v_salud);

  insert into public.notifications
    (user_id, type, title, message, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
  select o.user_id, 'blu_desconectado',
         'Blu está desconectado: no llegan los ingresos de las modelos',
         format('Fallan: %s. El último ingreso guardado es del %s. Hay que entrar a Blu y renovar la sesión de esa cuenta (BLU_JWT para Plus, BLU_JWT_MASSIVE para Massive).',
                v_detalle,
                coalesce(to_char((select max(e.date) from public.creator_daily_earnings e), 'DD/MM/YYYY'), 'nunca')),
         'blu', 'Finance', 'high', 'new', 'personal', '/dashboard'
    from public.tenant_owners o;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.vigilar_blu() from public, anon, authenticated;

select cron.schedule('vigia-blu', '*/30 * * * *', $$ select public.vigilar_blu(); $$);
