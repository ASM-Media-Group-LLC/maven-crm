
-- Disable closer access to Dashboard, Onboarding, Perfil, Prospectos submodules
UPDATE role_permissions SET can_access = false 
WHERE id IN (
  'd2bf7a12-2b79-46c7-9287-f545160e5227',
  '71cbded0-419c-4b82-b54b-8a1b3c00c694',
  '209f48dc-d06d-4676-a697-3b6bc92f8cdd'
);

-- Add Offboarding entry for closer (disabled)
INSERT INTO role_permissions (role_id, module, submodule, can_access)
SELECT rc.id, 'Creadores', 'Offboarding', false
FROM roles_config rc WHERE rc.name = 'closer'
ON CONFLICT DO NOTHING;

-- Add Personalizados entry for closer (disabled)
INSERT INTO role_permissions (role_id, module, submodule, can_access)
SELECT rc.id, 'Creadores', 'Personalizados', false
FROM roles_config rc WHERE rc.name = 'closer'
ON CONFLICT DO NOTHING;

-- Add created_by column to creators table
ALTER TABLE creators ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
