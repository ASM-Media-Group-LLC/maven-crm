-- Apodos / variantes de nombre del equipo → nombre canónico (como figura en
-- Hubstaff/Maven). Nace del incidente 31/07: Álvaro preguntó por "Juan Pachas"
-- (no existe con ese nombre en ningún sistema) y el bot, en vez de decirlo,
-- contestó con OTRAS personas. Además Whisper escribe variantes fonéticas
-- ("Brian", "Lisette") que no matchean el ilike de las RPCs.
--
-- La consumen las tools del bot (service_role). El alias se guarda NORMALIZADO
-- (minúsculas, sin acentos) y la tool normaliza lo que busca antes de comparar.
-- Un alias puede seguir siendo AMBIGUO a propósito ("brian" → "Brayan" matchea
-- a dos): la tool detecta el multi-match y PREGUNTA, no adivina.

create table team_name_aliases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  alias text not null,        -- lo que se DICE (normalizado: lower, sin acentos)
  canonical text not null,    -- lo que se BUSCA en Hubstaff/Maven
  note text,
  created_at timestamptz not null default now(),
  unique (tenant_id, alias)
);

-- Solo el bot (service_role, bypassa RLS). Sin policies = nadie más la ve.
alter table team_name_aliases enable row level security;

insert into team_name_aliases (tenant_id, alias, canonical, note) values
  ('30869615-f579-4981-8a1f-dbebc61eae2d', 'brian',    'Brayan',   'variante fonética/Whisper; sigue ambigua (2 Brayan) → la tool pregunta cuál'),
  ('30869615-f579-4981-8a1f-dbebc61eae2d', 'lisette',  'Lizeth',   'variante Whisper 31/07; sigue ambigua (3 Lizeth) → la tool pregunta cuál'),
  ('30869615-f579-4981-8a1f-dbebc61eae2d', 'lizet',    'Lizeth',   'variante ortográfica'),
  ('30869615-f579-4981-8a1f-dbebc61eae2d', 'liset',    'Lizeth',   'variante ortográfica'),
  ('30869615-f579-4981-8a1f-dbebc61eae2d', 'calorina', 'Carolina', 'artefacto de Whisper visto 31/07 (audio sucio)');
