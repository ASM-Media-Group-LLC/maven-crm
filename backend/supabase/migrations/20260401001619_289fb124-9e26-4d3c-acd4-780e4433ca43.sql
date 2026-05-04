-- Case 1: Notes that are ONLY an OF URL (pure URL, no extra text)
UPDATE closers_contacts
SET onlyfans_url = trim(notes), notes = NULL
WHERE notes ILIKE 'https://onlyfans.com/%'
  AND notes NOT LIKE '% %'
  AND (onlyfans_url IS NULL OR onlyfans_url = '');

-- Case 2: Notes with mixed content (text + URL) - extract URL, keep text
UPDATE closers_contacts
SET onlyfans_url = trim(substring(notes FROM '(https://onlyfans\.com/[^\s]+)')),
    notes = trim(regexp_replace(notes, 'https://onlyfans\.com/[^\s]+', ''))
WHERE notes ILIKE '%onlyfans.com%'
  AND notes LIKE '% %'
  AND (onlyfans_url IS NULL OR onlyfans_url = '');

-- Clean up empty notes after extraction
UPDATE closers_contacts SET notes = NULL WHERE notes = '' OR notes = '/';

-- Same for closer_creators - pure URL
UPDATE closer_creators
SET onlyfans_url = trim(notes), notes = NULL
WHERE notes ILIKE 'https://onlyfans.com/%'
  AND notes NOT LIKE '% %'
  AND (onlyfans_url IS NULL OR onlyfans_url = '');

-- closer_creators - mixed content
UPDATE closer_creators
SET onlyfans_url = trim(substring(notes FROM '(https://onlyfans\.com/[^\s]+)')),
    notes = trim(regexp_replace(notes, 'https://onlyfans\.com/[^\s]+', ''))
WHERE notes ILIKE '%onlyfans.com%'
  AND notes LIKE '% %'
  AND (onlyfans_url IS NULL OR onlyfans_url = '');

UPDATE closer_creators SET notes = NULL WHERE notes = '' OR notes = '/';