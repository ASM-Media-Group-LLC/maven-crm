

## Estado de Verificacion Persistente + Moneda en Precios

### Archivos a modificar

**1. `src/pages/creadores/onboarding/OnboardingWizard.tsx`** - Agregar badge de estado de verificacion en el header

**2. `src/pages/creadores/onboarding/steps/Step4WorkConfig.tsx`** - Agregar selector de moneda en la tabla de precios

**3. `src/pages/creadores/onboarding/steps/Step4WorkConfig.tsx` (tipos)** - Agregar campo `currency` a `Step4Data`

---

### Cambio 1: Badge de estado persistente en el header del wizard

En el `CardHeader` del `OnboardingWizard`, junto al titulo ("Iniciar Onboarding" / "Continuar Onboarding"), agregar un badge que muestre el estado actual del creador durante todo el flujo. El estado se deriva del `editCreatorId`: si se esta editando, se carga el `status` del creador desde la BD (ya disponible en el `useEffect` de carga). Para nuevos onboardings, el badge mostrara "Nuevo".

Estados y sus estilos:
- **Nuevo**: badge gris neutro (creacion nueva, sin ID)
- **Borrador**: badge amarillo/amber
- **Onboarding**: badge azul
- **Pendiente verificacion**: badge naranja/warning
- **Verificado**: badge verde/success

Se agregara un estado `creatorStatus` al wizard que se setea al cargar los datos del creador.

```text
CardHeader actual:
  [Titulo]                    [Volver a la lista]

CardHeader nuevo:
  [Titulo] [Badge: Estado]    [Volver a la lista]
```

El badge se mostrara con el componente `Badge` de shadcn ya existente (`@/components/ui/badge`), usando variantes de color con clases de Tailwind.

### Cambio 2: Selector de moneda en tabla de precios (Step 4)

Agregar un campo `currency` a `Step4Data` con valor por defecto `"USD"`. En la seccion "Precios por Servicio", encima de la tabla, colocar un `Select` dropdown para elegir la moneda (USD, EUR, COP, MXN, ARS, CLP, PEN, BRL). El simbolo mostrado en cada fila de precio se actualizara dinamicamente segun la moneda seleccionada.

```text
Layout actual:
  [Tabla de precios con $ fijo]

Layout nuevo:
  [Moneda: USD v]
  [Tabla de precios con simbolo dinamico]
```

Mapeo de simbolos: USD -> $, EUR -> EUR, COP -> COP, MXN -> MXN, etc.

---

### Detalle tecnico

**OnboardingWizard.tsx:**
- Agregar `import { Badge } from "@/components/ui/badge"`
- Nuevo estado: `const [creatorStatus, setCreatorStatus] = useState<string | null>(null)`
- En el `useEffect` de carga, setear `setCreatorStatus(c.status)` tras leer los datos
- En el `CardHeader`, insertar el badge despues del titulo con estilos condicionales

**Step4WorkConfig.tsx:**
- Agregar `currency: string` a `Step4Data` con default `"USD"`
- Agregar constante `CURRENCIES` con opciones de moneda
- Agregar `Select` de moneda encima de la tabla de precios
- Cambiar el simbolo `$` fijo por el simbolo dinamico de la moneda seleccionada
- Actualizar tambien la etiqueta del header de la tabla ("Precio sugerido ($)" -> dinamico)

**OnboardingWizard.tsx (initialStep4):**
- Agregar `currency: "USD"` al objeto inicial
- En `buildPayload`, incluir `currency` en `preciosContenido` o en `extraData`

