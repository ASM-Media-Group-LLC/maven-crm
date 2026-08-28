-- Bump atómico de uso de una API key (evita race en request_count).
create or replace function public.increment_api_key_usage(_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.api_keys
     set request_count = request_count + 1,
         last_used_at  = now()
   where id = _id;
$$;

revoke all on function public.increment_api_key_usage(uuid) from anon, authenticated;
