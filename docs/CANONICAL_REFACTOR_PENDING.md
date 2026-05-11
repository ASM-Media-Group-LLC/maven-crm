# Pendiente: drop columnas texto post unificación canónica

> **Fecha de apertura:** 2026-05-10
> **Estado:** abierto. La app corre en estado dual-write hasta que se confirme estabilidad y se ejecute la migration final.

## Contexto

El 2026-05-10 se unificaron compañías y categorías en tablas canónicas. Las columnas texto legacy quedaron vivas como "shadow cache" durante la transición. Cuando se confirme que nada las usa, dropearlas.

## Canónicas que ya viven

| Tabla canónica | Reemplaza textos en |
|---|---|
| `scouter_companies` | `creator_business.assigned_agency`, `leadgen_entries.company`, `closers_contacts.company` |
| `model_categories` | `creators.category`, `leadgen_entries.quality`, `qa_models.category`, `scouter_leads.category` |

`model_categories` tiene los códigos: **Elite**, A+, A, B+, B, C+, C.

## FK columns ya agregadas y backfilled (100% en categorías, 97-99% en compañías)

| Tabla | FK | Apunta a |
|---|---|---|
| `creator_business` | `company_id` | `scouter_companies` |
| `leadgen_entries` | `company_id` | `scouter_companies` |
| `closers_contacts` | `company_id` | `scouter_companies` |
| `creators` | `category_code` | `model_categories` |
| `leadgen_entries` | `category_code` | `model_categories` |
| `qa_models` | `category_code` | `model_categories` |
| `scouter_leads` | `category_code` | `model_categories` |

## Verificación antes de dropear

1. Usar la app normalmente 2-3 días post-deploy (>= 2026-05-13).
2. Confirmar que estos flujos andan:
   - `/creadores` filtro Compañía y Categoría
   - Crear nuevo creator + editar tab "Info"
   - `/leadgen` cargar lead + filtrar
   - `ConvertLeadModal` (lead → contacto)
   - Panel de Control conteos
3. Si nada rompe → drop seguro.

## Migration final (cuando se confirme)

```sql
-- supabase/migrations/<timestamp>_drop_legacy_text_columns.sql
ALTER TABLE public.creator_business DROP COLUMN IF EXISTS assigned_agency;
ALTER TABLE public.leadgen_entries  DROP COLUMN IF EXISTS company;
ALTER TABLE public.leadgen_entries  DROP COLUMN IF EXISTS quality;
ALTER TABLE public.closers_contacts DROP COLUMN IF EXISTS company;
ALTER TABLE public.creators         DROP COLUMN IF EXISTS category;
ALTER TABLE public.qa_models        DROP COLUMN IF EXISTS category;
ALTER TABLE public.scouter_leads    DROP COLUMN IF EXISTS category;
```

Después del drop, hacer cleanup en frontend:
- Grep por `?? *.assigned_agency`, `?? *.company`, `?? *.quality`, `?? *.category` y remover el fallback.
- Grep por `*_FALLBACK` arrays estáticos (CATEGORIES_FALLBACK, AGENCIES_FALLBACK, etc.) y remover.

## Migrations aplicadas

- `20260510210000_unify_companies_via_scouter_companies.sql`
- `20260510220000_closers_contacts_company_fk.sql`
- `20260510230000_unify_categories_via_model_categories.sql`
- `20260510231000_rename_aplus_to_elite.sql`

## Hooks canónicos (no romper)

- `frontend/src/hooks/useScouterLeads.ts` → `useScouterCompanies()`
- `frontend/src/hooks/useModelCategories.ts` → `useModelCategories()`
