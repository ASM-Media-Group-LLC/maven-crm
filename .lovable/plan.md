
# Pagina interna de Perfil del Creador

## Resumen
Crear una pagina completa `/creadores/:id` que se abre al hacer clic en el boton "Perfil Completo" del modal Ver Creador. La pagina sigue el layout existente (sidebar + topbar) y muestra el perfil completo del creador con un hero/header oscuro y tabs de contenido.

## Archivos a crear

### 1. `src/pages/CreadorProfile.tsx`
Pagina wrapper con SidebarProvider, DashboardSidebar y DashboardTopbar (igual que Creadores.tsx). Renderiza el componente de contenido del perfil.

### 2. `src/pages/creadores/CreadorProfileContent.tsx`
Componente principal del perfil con:

**Barra superior:**
- Boton "Volver" con flecha izquierda que navega a `/creadores`

**Hero/Header (fondo oscuro con gradiente):**
- Avatar grande (h-24 w-24) con iniciales o foto
- Nombre completo en texto grande uppercase (ej. "DANIELA CARDONA LOPEZ")
- Nombre artistico entre comillas debajo (ej. "Daniela C")
- Badge de estado (Activa, Onboarding, etc.)
- Badge de dias para cumpleanos (calculado desde birth_date)
- Botones de WhatsApp e Instagram como pills/chips
- Edad (calculada desde birth_date o campo age)

**Tabs horizontales (debajo del hero):**
- Informacion (activo por defecto)
- Lineamientos (placeholder)
- Redes (placeholder)
- Monetizacion (placeholder)
- Documentos (placeholder)
- Notas (placeholder)
- Tickets (placeholder)
- Historial (placeholder)

**Tab Informacion General:**
- Titulo "Informacion General" con boton "Editar" a la derecha
- Grid de 2 columnas con:
  - Agencia Asignada (con link clickeable)
  - Categoria
  - Estado
  - Fecha de Registro
  - Manager
  - Pais (con bandera)
  - Ciudad
  - Fecha de Nacimiento
  - Porcentaje con Agencia (campo agency_percentage de creator_business)
  - Notas Internas (campo internal_notes de creators)

**Datos necesarios:** Se usa el hook `useQuery` para obtener el creador por ID desde la URL, haciendo fetch con `supabase.from("creators").select("*, creator_business(*)").eq("id", id)`.

## Archivos a modificar

### 3. `src/App.tsx`
- Agregar ruta `/creadores/:id` que renderiza `CreadorProfile`

### 4. `src/pages/creadores/ViewCreadorModal.tsx`
- Importar `useNavigate` de react-router-dom
- El boton "Perfil Completo" navega a `/creadores/${creator.id}`
- Al navegar, cerrar el modal

### 5. `src/pages/creadores/useCreadores.ts`
- Agregar un hook `useCreadorById(id: string)` que hace fetch de un creador individual con todo su creator_business (todos los campos, no solo agency/manager/kash_type)

## Detalle tecnico

**Calculo de dias para cumpleanos:**
```
Si birth_date existe:
  - Calcular proximo cumpleanos en el ano actual o siguiente
  - Mostrar "X dias para su cumpleanos" con icono de calendario
```

**Campos del tab Informacion General y su origen:**

| Campo UI | Origen |
|----------|--------|
| Agencia Asignada | creator_business.assigned_agency |
| Categoria | creators.category |
| Estado | creators.status (con label traducido) |
| Fecha de Registro | creators.registration_date (formateado largo) |
| Manager | creator_business.manager_type |
| Pais | creators.country (con bandera) |
| Ciudad | creators.city |
| Fecha de Nacimiento | creators.birth_date (formateado largo) |
| Porcentaje con Agencia | creator_business.agency_percentage (mostrar con %) |
| Notas Internas | creators.internal_notes |

**Boton Editar:** Por ahora solo visual, sin funcionalidad.

**Ruta:** `/creadores/:id` - el ID se obtiene con `useParams()`.
