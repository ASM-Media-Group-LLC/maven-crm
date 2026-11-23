-- Restrictive policies add the position decision to existing membership/author
-- policies. They do not grant access to conversations, messages or calls.
create policy posiciones_crear_grupo on public.chat_conversations as restrictive for insert to authenticated
 with check(type<>'group' or public.posicion_decision((select auth.uid()),'N:msg.grupo') is distinct from false);
create policy posiciones_crear_llamada on public.calls as restrictive for insert to authenticated
 with check(public.posicion_decision((select auth.uid()),'N:msg.llamar') is distinct from false
   and public.posicion_decision((select auth.uid()),'Messenger|*') is distinct from false);
create policy posiciones_enviar_archivos on public.chat_messages as restrictive for insert to authenticated
 with check((file_url is null and type not in ('image','file','audio','video'))
   or public.posicion_decision((select auth.uid()),'N:msg.archivos') is distinct from false);
create policy posiciones_editar_archivos on public.chat_messages as restrictive for update to authenticated
 with check((file_url is null and type not in ('image','file','audio','video'))
   or public.posicion_decision((select auth.uid()),'N:msg.archivos') is distinct from false);

-- Updating a direct conversation into a group cannot bypass the insert policy.
create or replace function public.posicion_cuidar_tipo_chat() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if new.type='group' and old.type is distinct from new.type and auth.uid() is not null
   and public.posicion_decision(auth.uid(),'N:msg.grupo') is false then
   raise exception 'Tu posición no permite crear grupos' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.posicion_cuidar_tipo_chat() from public,anon,authenticated;
create trigger posicion_cuidar_tipo_chat before update of type on public.chat_conversations
 for each row execute function public.posicion_cuidar_tipo_chat();
