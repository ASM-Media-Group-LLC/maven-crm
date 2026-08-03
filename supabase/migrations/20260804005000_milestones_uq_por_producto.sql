-- El caso danyancatgaming (03/08) destapó el límite: CP Elite + Piclink vendidos
-- el MISMO día a la MISMA creadora = dos hitos venta_producto que colisionaban en
-- el índice (tenant, handle, kind, día). El producto entra a la clave; los null
-- de product colapsan a '' para que la protección anti-doble-corrida siga viva.
-- (Aplicada en prod vía MCP el 03/08; este archivo la versiona.)
drop index if exists uq_creator_milestones_dia;
create unique index uq_creator_milestones_dia
  on public.creator_milestones (tenant_id, lower(creator_handle), kind, coalesce(product,''), occurred_on);
