

## Agregar seccion de Agencias al Directorio de Contactos

### Resumen

Se agregara una barra de pestanas (tab bar) en la parte superior de la pagina de Contactos para separar dos secciones: **Contactos** (la vista actual) y **Agencias**. La seccion de Agencias permitira registrar agencias con un estado de gestion (Discovery, Contactada, En Proceso, Completada).

### Cambios en la base de datos

Se creara una nueva tabla `agencias` con las siguientes columnas:

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| id | uuid (PK) | Identificador unico |
| nombre | text (NOT NULL) | Nombre de la agencia |
| estado | text (NOT NULL, default 'Discovery') | Estado: Discovery, Contactada, En Proceso, Completada |
| pais | text | Pais de la agencia |
| contacto_nombre | text | Nombre del contacto principal |
| contacto_email | text | Email del contacto |
| contacto_telefono | text | Telefono del contacto |
| instagram | text | Perfil de Instagram |
| website | text | Sitio web |
| notas | text | Notas adicionales |
| created_at | timestamptz | Fecha de creacion |
| updated_at | timestamptz | Fecha de actualizacion |

Se incluira una politica RLS permisiva similar a la tabla `contactos`.

### Cambios en el frontend

#### 1. ContactosContent.tsx - Agregar tab bar

Se agregara la barra de pestanas con el patron existente del proyecto (`inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1`) en el header, justo debajo del titulo. Las pestanas seran:
- **Contactos** (vista actual, por defecto)
- **Agencias** (nueva seccion)

El boton "Agregar" cambiara su texto y destino segun la pestana activa.

#### 2. Nuevos archivos para la seccion de Agencias

Se crearan los siguientes componentes dentro de `src/pages/contactos/`:

- **AgenciasContent.tsx** - Contenido principal con KPIs, filtros, tabla/grid
- **AgenciasKPICards.tsx** - 4 tarjetas: Total, Discovery, En Proceso, Completadas
- **AgenciasTable.tsx** - Tabla con columnas: nombre, estado (badge con color), pais, contacto, instagram, fecha
- **AgenciasGrid.tsx** - Vista en tarjetas
- **AddAgenciaModal.tsx** - Modal para agregar nueva agencia con campos: nombre, estado (selector con Discovery/Contactada/En Proceso/Completada), pais, datos de contacto, notas
- **ViewAgenciaModal.tsx** - Modal para ver detalle de una agencia
- **EditAgenciaModal.tsx** - Modal para editar agencia
- **DeleteAgenciaDialog.tsx** - Dialogo de confirmacion para eliminar

#### 3. Flujo de usuario

1. El usuario entra a `/contactos` y ve la tab bar con "Contactos" activo
2. Al hacer clic en "Agencias", se muestra la seccion de agencias con sus KPIs y tabla
3. El boton "Agregar Agencia" abre un modal (no una pagina separada) para crear una nueva agencia
4. Al crear la agencia, el usuario selecciona el estado entre: Discovery, Contactada, En Proceso, Completada
5. En la tabla, el estado se muestra como un badge con colores diferenciados

#### 4. Colores de estado para agencias

- **Discovery**: badge azul (bg-blue-500/20, text-blue-400)
- **Contactada**: badge amarillo (bg-warning/20, text-warning)
- **En Proceso**: badge naranja (bg-orange-500/20, text-orange-400)
- **Completada**: badge verde (bg-success/20, text-success)

### Seccion tecnica

- La tab bar se implementa como un estado local (`activeTab: "contactos" | "agencias"`) en `ContactosContent.tsx`, renderizando condicionalmente el contenido
- Los datos de agencias se obtienen con `useQuery` apuntando a la tabla `agencias` de Supabase
- Las mutaciones (crear, editar, eliminar) usan `useMutation` con invalidacion del query `["agencias"]`
- No se requiere nueva ruta en el router; todo se maneja dentro de `/contactos`
- Se reutiliza el mismo layout (sidebar + topbar) existente

