

# Plan: Eliminar company_id de José Ignacio Vera

## Contexto

El campo `company_id` en la tabla `profiles` se asigna durante el registro cuando un usuario crea o se une a una empresa (en `Register.tsx`). José Ignacio Vera tiene `company_id = 10261fa0-...` mientras que los demás 36 usuarios tienen `NULL`. Esto causa que cuando él busca miembros, el filtro `.eq("company_id", ...)` solo lo retorna a él mismo.

## Cambio

### 1. Actualizar dato en la DB
Usar el insert tool para ejecutar:
```sql
UPDATE profiles SET company_id = NULL WHERE id = '071de069-206c-4f54-821f-09b0ae3b92ce';
```

### 2. Mantener el fix de código (ya aprobado previamente)
Igualmente aplicar el cambio `.or()` en los 3 archivos (`useTareas.ts`, `ProjectsListContent.tsx`, `SubtasksPanel.tsx`) para que en el futuro, si algún usuario tiene `company_id`, igual vea a los usuarios sin empresa asignada. Este fix ya fue aprobado en el plan anterior.

## Archivos modificados
| Recurso | Cambio |
|---------|--------|
| DB: `profiles` | SET company_id = NULL para José Ignacio Vera |
| `useTareas.ts` | `.eq()` → `.or()` en filtro de perfiles |
| `ProjectsListContent.tsx` | Mismo cambio |
| `SubtasksPanel.tsx` | Mismo cambio |

