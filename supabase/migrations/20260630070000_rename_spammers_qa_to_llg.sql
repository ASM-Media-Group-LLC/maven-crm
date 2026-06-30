-- Rename del submódulo de QA "Spammers QA" → "LLG QA" (la sección pasa a llamarse LLG's QA).
-- Migra las 8 filas de role_permissions para NO huérfanar el acceso (1 rol lo tiene en true).
-- El label visible en la UI será "LLG's QA"; el string interno de permiso queda "LLG QA".
update public.role_permissions
set submodule = 'LLG QA'
where module = 'Agency QA' and submodule = 'Spammers QA';
