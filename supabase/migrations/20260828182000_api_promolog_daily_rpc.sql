-- Estado diario de promoción por creadora/red para la API pública (scope promolog:read).
-- Agrega promolog_entries (1 fila por historia) a 1 fila por (dia, creadora, red).
-- Usa `dia` (día en Bogotá), NUNCA date::date. `promoted` es TEXTO con valores
-- mixtos (true/false actuales + legacy yes/no/pending/partial): truthy = true|yes.
create or replace function public.api_promolog_daily(
  _from date default null,
  _to date default null,
  _creator_id uuid default null,
  _network text default null,
  _limit int default 100,
  _offset int default 0
)
returns table (
  dia date,
  creator_id uuid,
  creator text,
  network text,
  promoted boolean,
  promoted_stories int,
  stories int
)
language sql
stable
security definer
set search_path = public
as $$
  select e.dia,
         e.creator_id,
         coalesce(c.artistic_name, c.name) as creator,
         e.network,
         bool_or(e.promoted in ('true', 'yes')) as promoted,
         count(*) filter (where e.promoted in ('true', 'yes'))::int as promoted_stories,
         count(*)::int as stories
  from public.promolog_entries e
  left join public.creators c on c.id = e.creator_id
  where (_from is null or e.dia >= _from)
    and (_to is null or e.dia <= _to)
    and (_creator_id is null or e.creator_id = _creator_id)
    and (_network is null or lower(e.network) = lower(_network))
  group by e.dia, e.creator_id, coalesce(c.artistic_name, c.name), e.network
  order by e.dia desc, creator
  limit least(greatest(_limit, 1), 500)
  offset greatest(_offset, 0)
$$;

revoke all on function public.api_promolog_daily(date, date, uuid, text, int, int) from anon, authenticated;
