-- Fix remaining "Pendiente LG" records → "Nuevo"
UPDATE closer_creators SET stage = 'Nuevo' WHERE stage = 'Pendiente LG';