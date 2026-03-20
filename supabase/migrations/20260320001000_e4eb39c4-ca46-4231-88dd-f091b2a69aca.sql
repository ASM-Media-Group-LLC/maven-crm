
-- Delete test records with fake UUIDs
DELETE FROM public.leadgen_entries
WHERE lg_user_id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555',
  '88888888-8888-8888-8888-888888888888',
  '99999999-9999-9999-9999-999999999999',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

-- Delete remaining test records by handle + date
DELETE FROM public.leadgen_entries
WHERE entry_date <= '2025-10-15'
  AND model_handle IN (
    'pepe_a_1','pepe_a_2','pepe_a_3','pepe_a_4','pepe_a_5','pepe_a_6','pepe_a_7',
    'pepe_aplus_1','pepe_aplus_2','pepe_aplus_3','pepe_aplus_4','pepe_aplus_5',
    'pepe_b_2','pepe_bplus_1','pepe_bplus_2','pepe_bplus_4',
    'luna_l','sofia_star','dany_blue','mia_moon'
  );
