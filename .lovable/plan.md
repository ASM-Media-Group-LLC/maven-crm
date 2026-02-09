

# Modal "Ver Creador" al hacer clic en el icono Eye

## Resumen
Crear un modal de solo lectura que muestra la informacion del creador con un header con avatar, nombre artistico, nombre real, estado con badge de categoria, y un boton "Perfil Completo". Debajo, tabs para Info, Redes, Notas y Monetizacion (inicialmente solo Info activo). Boton "Cerrar" en el footer.

## Archivos a crear

### 1. `src/pages/creadores/ViewCreadorModal.tsx`
Componente Dialog de solo lectura con:

**Header del modal:**
- Avatar grande (h-16 w-16) con iniciales o foto
- Nombre artistico en texto grande (ej. "Jessy Asu")
- Nombre real debajo en texto muted (ej. "Jessica Paola Maldonado Vargas")
- Badge de categoria (A+, A, B+, etc.) con colores existentes
- Badge de estado (Onboarding, Activa, etc.) con colores existentes
- Boton "Perfil Completo" con icono ExternalLink (alineado a la derecha, solo visual por ahora)

**Tabs (usando componente Tabs existente):**
- **Info** (activo por defecto): Grid de 2 columnas con:
  - Ubicacion (flag emoji + ciudad)
  - Agencia (assigned_agency del creator_business)
  - Email
  - Telefono
  - Tipo de Manager (manager_type del creator_business)
  - Fecha de Registro (registration_date formateado)
  - Idiomas (badges con los idiomas del array languages)
- **Redes**: Links a Instagram, TikTok, Twitter/X, YouTube, OnlyFans, WhatsApp
- **Notas (0)**: Placeholder "Sin notas" (funcionalidad futura)
- **Monetizacion**: Placeholder "Sin datos" (funcionalidad futura)

**Footer:**
- Boton "Cerrar" alineado a la derecha

**Props:** `open`, `onOpenChange`, `creator: CreatorWithBusiness`

## Archivos a modificar

### 2. `src/pages/creadores/CreadoresTable.tsx`
- Agregar estado `viewingCreator` (`CreatorWithBusiness | null`)
- Al hacer clic en el boton Eye, setear `viewingCreator`
- Importar y renderizar `ViewCreadorModal`
- Al cerrar modal, limpiar `viewingCreator`

## Detalle tecnico

**Datos mostrados en tab Info y su origen:**

| Campo UI | Origen |
|----------|--------|
| Ubicacion | country_code (flag) + city |
| Agencia | creator_business.assigned_agency |
| Email | email |
| Telefono | phone |
| Tipo de Manager | creator_business.manager_type |
| Fecha de Registro | registration_date (formateado con date-fns: "dd MMM yyyy", locale es) |
| Idiomas | languages (array, mostrar como badges) |

**Datos en tab Redes:**
Cada red social con icono y link clickeable. Mostrar "---" si no tiene handle.

