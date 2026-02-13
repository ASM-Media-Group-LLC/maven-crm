

# Eliminar cards duplicadas y mejorar hover de KPI Cards principales

## Problema identificado

Hay **dos cards duplicadas** entre las dos secciones:
- **"Subiendo"** aparece tanto en las KPI cards de arriba como en las cards operacionales de abajo
- **"En Riesgo"** aparece en ambas secciones tambien

Ademas, las KPI cards principales (arriba) deben ser **visualmente mas grandes** y tener el **mismo estilo de hover con gradiente** que se usa en las cards de Creadores (`hover:bg-gradient-to-br hover:from-{color}/15 hover:to-transparent hover:border-{color}/40`).

## Cambios

### 1. Eliminar duplicados en `SalesOperationalCards.tsx`

Remover las cards "Subiendo" (id: `rising`) y "En Riesgo" (id: `at_risk`) del array de cards operacionales, ya que esa informacion ya esta en las KPI cards superiores. El grid operacional pasara de 10 a 8 cards.

### 2. Mejorar estilo de `SalesKPICards.tsx`

**Tamano mas grande:**
- Aumentar padding de `p-4` a `p-5`
- Aumentar tamano del valor de `text-2xl` a `text-3xl`
- Aumentar tamano del icono container de `p-1.5` a `h-9 w-9`
- Aumentar icono de `h-4 w-4` a `h-5 w-5`

**Hover con gradiente** (igual al de Creadores):
Cada card tendra su propio `hoverClass` basado en su color:
- Ingresos Total (primary): `hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:to-transparent hover:border-primary/40`
- Net Earnings (success): `hover:scale-[1.03] hover:bg-gradient-to-br hover:from-success/15 hover:to-transparent hover:border-success/40`
- Creadoras (accent): `hover:scale-[1.03] hover:bg-gradient-to-br hover:from-accent/15 hover:to-transparent hover:border-accent/40`
- Subiendo (success): mismo que Net Earnings
- En Riesgo (destructive): `hover:scale-[1.03] hover:bg-gradient-to-br hover:from-destructive/15 hover:to-transparent hover:border-destructive/40`

Todas con `transition-all duration-200` y `hover:shadow-lg`.

### 3. Cards operacionales se mantienen mas compactas

Las cards operacionales (Comparativas, Top 10, Bajando, Alto Potencial, Alertas, Calendario, Clari AI, Todas) mantienen su tamano actual de `p-4` para crear una jerarquia visual clara entre las KPI principales y las operacionales.

## Archivos a modificar

- `src/pages/sales-overview/SalesKPICards.tsx` -- hover con gradiente y tamano mas grande
- `src/pages/sales-overview/SalesOperationalCards.tsx` -- eliminar cards "Subiendo" y "En Riesgo"

