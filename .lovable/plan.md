

## Plan: Mejorar sección Beneficios (Landing) + Nuevo módulo SuperContacts

### Parte 1: Mejorar sección "Beneficios clave" en Landing

Reescribir los beneficios con un enfoque más marketing/ventas orientado a agencias. En vez de describir features técnicas, comunicar resultados y dolor que se resuelve.

**Archivo:** `src/pages/landing/LandingBenefits.tsx`

- Expandir de 4 a 6 beneficios en grid `sm:grid-cols-2 lg:grid-cols-3`
- Nuevos beneficios orientados a marketing:
  1. **Ahorra +20 horas/semana** — Automatiza nómina, comisiones, reportes y seguimiento. Tu equipo se enfoca en crecer, no en tareas repetitivas.
  2. **Reemplaza 8+ herramientas** — Olvídate de Notion, Slack, hojas de cálculo y 5 apps más. Todo centralizado en un solo lugar.
  3. **Escala sin caos** — De 10 a 500 creadores sin perder el control. Permisos por rol, dashboards por área y procesos estandarizados.
  4. **Decisiones con datos** — Dashboards en tiempo real con métricas de ventas, rendimiento y operaciones. Sin esperar reportes manuales.
  5. **IA que vende por ti** — Asistente inteligente que ayuda a tus chatters a cerrar más ventas con estrategias personalizadas por creador.
  6. **Tu equipo, conectado** — Messenger, videollamadas, tareas y notificaciones integrados. Cero fragmentación en la comunicación.
- Cambiar título a "¿Por qué Maven?" y subtítulo más aspiracional
- Agregar métricas/datos de impacto debajo de cada título (ej: "20+ hrs/semana", "8 herramientas menos")

---

### Parte 2: Módulo SuperContacts (nuevo, ruta `/supercontacts`)

Módulo independiente para gestionar una base de prospectos (Instagram creators) con importación masiva y perfiles enriquecidos.

#### Base de datos — Nueva tabla `super_contacts`

```sql
CREATE TABLE super_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_handle TEXT NOT NULL,
  full_name TEXT,
  profile_photo_url TEXT,
  followers_count INTEGER,
  bio TEXT,
  category TEXT,
  country TEXT,
  city TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  status TEXT DEFAULT 'nuevo', -- nuevo, contactado, interesado, no_interesado, convertido
  enriched BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabla de interacciones
CREATE TABLE super_contact_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES super_contacts(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL, -- llamada, mensaje, email, nota
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

+ RLS policies para authenticated + índice único en `instagram_handle`

#### Frontend — Páginas y componentes

1. **`src/pages/SuperContacts.tsx`** — Layout page con sidebar
2. **`src/pages/supercontacts/SuperContactsContent.tsx`** — Contenido principal:
   - KPI cards (total, nuevos, contactados, convertidos)
   - Tabla con filtros (status, categoría, país)
   - Búsqueda por handle/nombre
3. **`src/pages/supercontacts/ImportModal.tsx`** — Modal de importación:
   - Textarea para pegar handles (uno por línea, separados por comas, o mezclados)
   - Upload de CSV/PDF con parsing de handles (@usuario o URLs de Instagram)
   - Preview de handles detectados antes de importar
   - Inserción masiva con detección de duplicados
4. **`src/pages/supercontacts/SuperContactProfile.tsx`** — Perfil del contacto:
   - Foto de perfil, handle, seguidores, bio
   - Timeline de interacciones
   - Botón para registrar nueva interacción
   - Botón "Enriquecer" (placeholder para futura API de Instagram)
   - Botón "Convertir a Creador" → inserta en tabla `creators`
5. **`src/pages/supercontacts/useSuperContacts.ts`** — Hook con queries y mutations

#### Routing
- Agregar rutas en `App.tsx`: `/supercontacts` y `/supercontacts/:id`
- Agregar item en sidebar bajo sección apropiada

#### Enriquecimiento (fase 1 — manual + placeholder)
- Botón "Enriquecer perfil" en cada contacto (disabled con tooltip "Próximamente — requiere API key")
- Campo para que el usuario ingrese manualmente: foto URL, seguidores, bio
- En fase futura: conectar API de Instagram con secret key

### Archivos a crear/modificar
- `src/pages/landing/LandingBenefits.tsx` — Reescribir contenido marketing
- Migración SQL — tablas `super_contacts` + `super_contact_interactions` + RLS
- `src/pages/SuperContacts.tsx` — Layout page
- `src/pages/supercontacts/SuperContactsContent.tsx` — Lista + filtros + KPIs
- `src/pages/supercontacts/ImportModal.tsx` — Importación CSV/paste
- `src/pages/supercontacts/SuperContactProfile.tsx` — Perfil con interacciones
- `src/pages/supercontacts/useSuperContacts.ts` — Hooks de datos
- `src/App.tsx` — Rutas
- `src/components/dashboard/DashboardSidebar.tsx` — Item de menú

