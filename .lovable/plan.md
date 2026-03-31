

## Plan: Rediseño completo de SuperContacts — Perfil con Dashboard por creadora + País/Ciudad con selectores inteligentes

### Resumen

Tres cambios principales:
1. **País con banderas (selector)** — Reemplazar inputs de texto por selectores con banderas y ciudades dependientes del país
2. **Interacciones enriquecidas** — Ampliar la tabla de interacciones para registrar desde qué marca/cuenta se contactó y qué screenshot se dio
3. **Dashboard individual por creadora** — En el perfil de cada SuperContact, un dashboard profesional con timeline de interacciones, KPIs y calendario con rango de fechas
4. **Dashboard general** — Mejorar el analytics modal con calendario desde-hasta y métricas agregadas de todas las creadoras

---

### 1. Selector de País con banderas + Ciudades dependientes

**Archivos:** `AddSingleContactModal.tsx`, `SuperContactProfile.tsx` (formulario de edición)

- Reemplazar el `<Input>` de país por un `<Select>` con las opciones de `country-utils.ts` mostrando `🇨🇴 Colombia`, `🇲🇽 México`, etc.
- Al seleccionar un país, poblar un segundo `<Select>` de ciudad con ciudades predefinidas por país (Colombia: Bogotá, Medellín, Cali, Barranquilla, Cartagena, Bucaramanga, Pereira, etc. — y así para cada país del COUNTRY_DATA)
- Crear archivo `src/lib/city-data.ts` con el mapeo `countryCode → string[]` de ciudades principales por país
- Permitir "Otra" como opción para escribir una ciudad no listada

### 2. Interacciones enriquecidas (marca, cuenta, screenshot)

**Migración SQL — nueva tabla `super_contact_outreach`:**

```sql
CREATE TABLE public.super_contact_outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.super_contacts(id) ON DELETE CASCADE NOT NULL,
  brand TEXT NOT NULL,           -- Cash, Exchange, Ora, Link Hunter, Lumina, Big Link, Maven, Blue, Traffix
  instagram_account TEXT,        -- desde qué cuenta de IG se le habló
  message_type TEXT NOT NULL DEFAULT 'dm',  -- dm, story_reply, comment, email, whatsapp
  screenshot_url TEXT,           -- URL del pantallazo
  notes TEXT,
  response TEXT,                 -- qué respondió
  response_status TEXT DEFAULT 'pending', -- pending, positive, negative, no_response
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Con RLS similar a la tabla de interacciones existente.

**Archivo:** `SuperContactProfile.tsx`

- Nueva sección **"Alcance por Marca"** debajo del header, con:
  - Selector de marca (las 9 marcas: Cash, Exchange, Ora, Link Hunter, Lumina, Big Link, Maven, Blue, Traffix)
  - Input de cuenta de Instagram desde la que se escribió
  - Selector de tipo de mensaje (DM, Story Reply, Comentario, Email, WhatsApp)
  - Input para URL de screenshot
  - Notas y respuesta
  - Botón "Registrar Contacto"
- Timeline visual de todos los contactos realizados, agrupados por marca con badges de color
- Mantener la sección de interacciones/notas existente intacta

### 3. Dashboard individual por creadora

**Archivo:** `SuperContactProfile.tsx` — nueva sección con tabs

Agregar debajo de la sección de alcance un dashboard con:

| Tab | Contenido |
|-----|-----------|
| **Resumen** | KPIs: Total contactos realizados, marcas que la contactaron, tasa de respuesta, último contacto. Timeline visual con todas las interacciones ordenadas cronológicamente |
| **Por Marca** | Breakdown de cuántas veces se le habló desde cada marca, con qué resultado. Barras horizontales por marca |
| **Calendario** | Vista de calendario con `DateRangePicker` mostrando en qué días se le contactó, con dots de colores por marca |

### 4. Dashboard general mejorado

**Archivo:** `SuperContactsAnalyticsModal.tsx`

Agregar nuevas pestañas:
- **Alcance General**: Total de contactos realizados a todas las creadoras, segmentado por marca (barras stacked)
- **Tasa de Respuesta**: % de respuestas positivas/negativas/sin respuesta por marca
- **Calendario de Actividad**: DateRangePicker con filtro desde-hasta, mostrando actividad diaria de outreach

El `DateRangePicker` ya existe como componente — se reutiliza en el modal para filtrar todo por rango.

### Archivos a crear/modificar

| Archivo | Cambio |
|---------|--------|
| Migración SQL | Crear tabla `super_contact_outreach` con RLS |
| `src/lib/city-data.ts` | Nuevo — mapeo país→ciudades |
| `src/pages/supercontacts/useSuperContacts.ts` | Agregar hooks para outreach: `useSuperContactOutreach`, `useCreateOutreach` |
| `src/pages/supercontacts/AddSingleContactModal.tsx` | Selectores de país (banderas) y ciudad (dependiente) |
| `src/pages/supercontacts/SuperContactProfile.tsx` | Formulario de outreach por marca, dashboard individual con tabs, selectores de país/ciudad en edición |
| `src/pages/supercontacts/SuperContactsAnalyticsModal.tsx` | Nuevas pestañas de alcance, respuestas y calendario con DateRangePicker |

