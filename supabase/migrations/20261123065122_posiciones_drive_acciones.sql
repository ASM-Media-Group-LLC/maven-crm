-- Keep the existing file ownership and company checks, and add the explicit
-- share action. Removing oneself from a share remains available.
create policy posicion_drive_share_insert on public.drive_shares as restrictive for insert to authenticated
 with check(public.posicion_decision((select auth.uid()),'N:drive.compartir') is distinct from false);
create policy posicion_drive_share_update on public.drive_shares as restrictive for update to authenticated
 using(public.posicion_decision((select auth.uid()),'N:drive.compartir') is distinct from false)
 with check(public.posicion_decision((select auth.uid()),'N:drive.compartir') is distinct from false);
create policy posicion_drive_share_delete on public.drive_shares as restrictive for delete to authenticated
 using(user_id=(select auth.uid()) or public.posicion_decision((select auth.uid()),'N:drive.compartir') is distinct from false);
create policy posicion_drive_empresa_insert on public.drive_compartido_agencia as restrictive for insert to authenticated
 with check(public.posicion_decision((select auth.uid()),'N:drive.compartir') is distinct from false);
create policy posicion_drive_empresa_update on public.drive_compartido_agencia as restrictive for update to authenticated
 using(public.posicion_decision((select auth.uid()),'N:drive.compartir') is distinct from false)
 with check(public.posicion_decision((select auth.uid()),'N:drive.compartir') is distinct from false);
create policy posicion_drive_empresa_delete on public.drive_compartido_agencia as restrictive for delete to authenticated
 using(public.posicion_decision((select auth.uid()),'N:drive.compartir') is distinct from false);

create or replace function public.posicion_drive_papelera() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if new.trashed_at is distinct from old.trashed_at and auth.uid() is not null
   and public.posicion_decision(auth.uid(),'N:drive.borrar') is false then
   raise exception 'Tu posición no permite mover archivos a la papelera ni restaurarlos' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.posicion_drive_papelera() from public,anon,authenticated;
create trigger posicion_drive_papelera before update of trashed_at on public.drive_items
 for each row execute function public.posicion_drive_papelera();
