

## Flujo de Prospectos para Creadores

Se creara una nueva seccion `/creadores/prospectos` que funciona como embudo previo al onboarding, usando la misma estructura visual de `/hr/candidatos`.

---

### 1. Base de datos: nueva tabla `creator_prospects`

Se creara una tabla dedicada para separar prospectos del flujo de creadores activos:

```text
creator_prospects
  id           uuid PK
  name         text NOT NULL
  instagram    text
  tiktok       text
  platform     text (TikTok, Instagram, OnlyFans, etc.)
  category     text
  agency       text
  country      text
  email        text
  phone        text
  source       text (Redes, Referido, Scouting, etc.)
  status       text DEFAULT 'lead' (lead, contactado, negociando, convertido, descartado)
  notes        text
  created_by   uuid
  created_at   timestamptz DEFAULT now()
  updated_at   timestamptz DEFAULT now()
```

Politica RLS: acceso completo para usuarios autenticados (misma politica que `contactos` y `agencias`).

---

### 2. Pagina principal: `src/pages/creadores/prospectos/ProspectosPage.tsx`

Estructura identica a HRApplicants:

- **Header fijo**: Titulo "Prospectos", subtitulo, boton CTA "Nuevo Prospecto"
- **4 KPI Cards**: Total Prospectos, Pendientes de Contacto (status=lead), En Negociacion (status=negociando), Tasa de Conversion (convertidos/total %)
- **Tabs de agencia**: Usando el orden canonico (Atomic, Elite, Kash, Unlok, Trafix, Otra)
- **Barra de filtros**: Buscador, filtro de estado, toggle Lista/Grid
- **Tabla**: Columnas - Creador (@user con avatar initials), Plataforma, Categoria, Agencia, Fecha de Registro, Estado (badges con colores), Acciones
- **Grid view**: Cards con la misma estructura

---

### 3. Acciones por registro

- **Ver** (Eye icon): Modal con detalle completo
- **Editar** (Pencil icon): Modal de edicion inline
- **Eliminar** (Trash2 icon): AlertDialog de confirmacion
- **Iniciar Onboarding** (boton principal, variante default/morado): Abre modal de confirmacion

---

### 4. Modal "Iniciar Onboarding"

Al hacer clic en "Iniciar Onboarding":

1. Se abre un `Dialog` de confirmacion con:
   - Nombre del prospecto (solo lectura)
   - Selector de Agencia (Kash, Atomic, Elite, Unlok, Trafix, Otra)
   - Boton "Confirmar e Iniciar"
2. Al confirmar:
   - Se crea un nuevo registro en la tabla `creators` con status `borrador` y los datos del prospecto (nombre, email, phone, country, instagram, tiktok, category)
   - Se crea el registro asociado en `creator_business` con la agencia seleccionada
   - Se actualiza el prospecto a status `convertido`
   - Se redirige a `/creadores/onboarding/{nuevo_id}` para continuar el wizard

---

### 5. Completar onboarding -> Listado de Creadores

El flujo existente ya maneja esto parcialmente. Se ajustara el `OnboardingWizard.tsx` para que al completar el paso 4 (cuando el status cambia a `verificado` o `active`), el creador aparezca automaticamente en el listado de `/creadores` ya que el hook `useCreadores` consulta todos los creators con esos estados.

No se requiere logica adicional: el listado ya filtra por status y muestra todos los creadores activos.

---

### 6. Sidebar: agregar "Prospectos" al submenu de Creadores

En `DashboardSidebar.tsx`, agregar la entrada "Prospectos" al array `creadoresSubItems`:

```text
Dashboard
Listado
Prospectos    <-- nuevo
Onboarding
```

---

### 7. Modal "Nuevo Prospecto"

Un `Dialog` simple con los campos: Nombre, Instagram (@), TikTok (@), Plataforma principal (Select), Categoria, Agencia (Select con orden canonico), Pais, Email, Telefono (PhoneInput), Fuente (Select), Notas. Boton de guardar con mutation.

---

### Archivos a crear

| Archivo | Descripcion |
|---------|-------------|
| `src/pages/creadores/prospectos/ProspectosPage.tsx` | Pagina principal con KPIs, tabla, grid, filtros y modales |
| `src/pages/creadores/prospectos/useProspectos.ts` | Hook con query, mutations (CRUD + convertir a onboarding) |
| `src/pages/creadores/prospectos/StartOnboardingModal.tsx` | Modal de confirmacion para iniciar onboarding |

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/App.tsx` | Agregar ruta `/creadores/prospectos` |
| `src/components/dashboard/DashboardSidebar.tsx` | Agregar "Prospectos" al submenu de Creadores |
| Migracion SQL | Crear tabla `creator_prospects` con RLS |

---

### Detalle tecnico

- Se reutiliza `DashboardMetricCard` para los KPIs
- Se reutiliza el patron de tabla/grid/filtros de `HRApplicants`
- Los badges de estado usan colores consistentes: lead (azul), contactado (amarillo), negociando (morado), convertido (verde), descartado (gris)
- El orden canonico de agencias se reutiliza del array `AGENCY_ORDER` existente
- La tabla usa sticky header y sticky actions column como en HRApplicants
- Todos los componentes siguen el dark mode y sistema de diseno existente

