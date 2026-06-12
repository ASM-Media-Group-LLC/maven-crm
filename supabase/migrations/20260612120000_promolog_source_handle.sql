-- promolog_entries.source_handle: de qué CUENTA de la red vino la entry (ej. la 2ª
-- cuenta de IG/X). NULL = la principal o desconocida. Lo setean los scanners para que
-- el popup/columna muestre exactamente qué cuenta promocionó (modelos con multi-cuenta).
alter table public.promolog_entries add column if not exists source_handle text;
comment on column public.promolog_entries.source_handle is 'Handle/cuenta de la red de donde vino la entry (multi-cuenta). NULL = principal/desconocida.';
