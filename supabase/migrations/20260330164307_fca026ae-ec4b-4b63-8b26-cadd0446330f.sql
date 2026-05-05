DELETE FROM closer_creators
WHERE (phone IS NULL OR trim(phone) = '')
  AND stage = 'Nuevo';