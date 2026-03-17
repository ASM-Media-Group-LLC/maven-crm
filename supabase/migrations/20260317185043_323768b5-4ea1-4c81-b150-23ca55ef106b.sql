
-- Add host_invite_code to cowork_sessions for secure host joining
ALTER TABLE public.cowork_sessions 
  ADD COLUMN host_invite_code text NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex');

-- Backfill existing sessions
UPDATE public.cowork_sessions SET host_invite_code = encode(gen_random_bytes(6), 'hex') WHERE host_invite_code IS NULL;
