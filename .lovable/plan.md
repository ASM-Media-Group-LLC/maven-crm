

## Plan: Agregar LeakHunter + Reestructurar Revenue Cards

### Cambios

**1. Agregar "LeakHunter" a PLATFORMS y LEADGEN_COMPANIES**

- `src/pages/closers/hooks/useCloserLeads.ts` línea 61: cambiar PLATFORMS a `["OnlyFans", "Trafix", "Blu", "Piclink", "LeakHunter", "ORA", "Otra"]`
- `src/pages/leadgen/leadgenConstants.ts` línea 44: agregar `"LeakHunter"` al array LEADGEN_COMPANIES (orden alfabético)

**2. Reestructurar revenue cards en `ClosersKPICards.tsx`**

Reemplazar la card "Revenue Total" por dos cards resumen:
- **Revenue Plataformas**: suma de LeakHunter + Blu + Trafix + ORA + Piclink (sin OnlyFans)
- **Revenue OnlyFans**: solo OnlyFans, separado

Las cards individuales por plataforma se mantienen, pero ahora incluyen LeakHunter y ORA. El grid pasa de 5 a 8 columnas (7 plataformas + 2 totales parciales → se agrupan como: OF, LeakHunter, Blu, Trafix, ORA, Piclink, Rev Plataformas, Rev OF).

### Archivos a modificar
- `src/pages/closers/hooks/useCloserLeads.ts` — agregar "LeakHunter" y "ORA" a PLATFORMS
- `src/pages/closers/components/ClosersKPICards.tsx` — agregar cards LeakHunter/ORA, separar revenue en "Plataformas" vs "OnlyFans"
- `src/pages/leadgen/leadgenConstants.ts` — agregar "LeakHunter" a LEADGEN_COMPANIES

