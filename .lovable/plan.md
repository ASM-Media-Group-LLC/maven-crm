

## Plan: Mostrar toda la data por defecto + badge de Promolog correcto

### Cambio de filosofía
Actualmente Promolog y LeadGen inician filtrados por "hoy", lo que causa que el badge (25,371 sin revisar) no coincida con la vista (0 entradas de hoy). La solución correcta es: **todas las vistas muestran toda la data por defecto** (sin filtro de fecha), y el badge cuenta todos los pendientes sin filtro de fecha (como ya lo hace).

### Cambios

**1. Promolog — quitar filtro de fecha por defecto**
En `src/pages/promolog/PromologContent.tsx` línea 143-144:
```ts
// Antes
const [dateFrom, setDateFrom] = useState<Date | undefined>(new Date());
const [dateTo, setDateTo] = useState<Date | undefined>(new Date());

// Después
const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
```

**2. LeadGen — quitar filtro de fecha por defecto**
En `src/pages/leadgen/LeadGenContent.tsx` línea 64-65:
```ts
// Antes
const [dateFrom, setDateFrom] = useState<Date | undefined>(new Date());
const [dateTo, setDateTo] = useState<Date | undefined>(new Date());

// Después
const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
```

**3. SalesOverview — quitar filtro de fecha por defecto**
En `src/pages/SalesOverview.tsx` línea 19-20:
```ts
// Antes
const [dateFrom, setDateFrom] = useState<Date | undefined>(startOfWeek(today, { weekStartsOn: 1 }));
const [dateTo, setDateTo] = useState<Date | undefined>(today);

// Después
const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
```

**4. Badge de Promolog — NO cambiar**
El hook `useSidebarBadges.ts` ya cuenta todos los pendientes sin filtro de fecha. Con las vistas mostrando toda la data, el número del badge (25,371) coincidirá con lo que el usuario ve al entrar a `/promolog`.

### Archivos
- **Modificar**: `src/pages/promolog/PromologContent.tsx`
- **Modificar**: `src/pages/leadgen/LeadGenContent.tsx`
- **Modificar**: `src/pages/SalesOverview.tsx`

