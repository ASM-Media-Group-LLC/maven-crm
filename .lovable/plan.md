

## Plan: Corregir visibilidad de datos en Contactos y Closers

### Diagnóstico

Encontré **2 causas raíz** de por qué no se ven los datos correctos:

#### 1. Closers — RLS bloquea el tab "Nuevo" para usuarios no-admin

La tabla `closer_creators` tiene RLS habilitado con estas políticas de SELECT:
- **Admins**: ven todo
- **Managers**: ven todo  
- **Closers/Agents**: solo ven registros donde `assigned_to = auth.uid()`

El problema: los 420 registros en stage "Nuevo" tienen `assigned_to = NULL` (son contactos recién creados, aún no asignados). Entonces un closer o agent **no ve ninguno** aunque el RPC de conteos (que usa `SECURITY DEFINER`) sí los cuenta. El usuario ve los KPIs con números pero la tabla vacía.

**Solución**: Agregar una política RLS que permita a los usuarios ver los registros de `closer_creators` que ellos mismos crearon (`created_by = auth.uid()`). Esto cubre el tab "Nuevo" donde los agentes deben ver sus propios contactos.

#### 2. Closers — `keepPreviousData` muestra datos del tab anterior

El hook usa `placeholderData: keepPreviousData`, lo que causa que al cambiar de tab se muestren brevemente los datos del tab anterior, dando la impresión de "datos incorrectos" o "versión vieja".

**Solución**: Eliminar `placeholderData: keepPreviousData` para que al cambiar de tab se muestre el loading state en lugar de datos stale de otro tab.

#### 3. Contactos — funciona correctamente

La tabla `closers_contacts` tiene RLS **deshabilitado**, y la query con paginación (50 por página) funciona bien. Los 475 registros están accesibles. Si el usuario no ve todos, es porque debe navegar las páginas. El total se muestra correctamente en el header.

### Cambios propuestos

#### Archivo 1: Migration SQL
```sql
-- Permitir a usuarios ver los closer_creators que ellos crearon
CREATE POLICY "Users see own created closer_creators"
ON public.closer_creators FOR SELECT
TO authenticated
USING (created_by = auth.uid());
```

#### Archivo 2: `src/pages/closers/hooks/useCloserLeads.ts`
- Eliminar `placeholderData: keepPreviousData` de la query principal para evitar flash de datos incorrectos al cambiar tabs

### Resultado
- Los agentes verán sus propios contactos en el tab "Nuevo"
- Al cambiar de tab no se mostrarán datos de otro tab temporalmente
- Contactos sigue funcionando correctamente con paginación

