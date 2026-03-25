

## Plan: Reestructurar Permisos como página completa + eliminar Incapacidades del sidebar

### Resumen
1. Eliminar "Incapacidades" del sidebar (ya que permisos cubrirá todo: permisos, ausencias e incapacidades).
2. Convertir el flujo de "Solicitar Permiso" de modal a página interna en `/hr/permisos/nuevo`, con layout header fijo + footer fijo + formulario con soporte para adjuntar archivos (imagen/PDF).
3. Ampliar los tipos de permiso para incluir incapacidades.

### Cambios

**1. Sidebar** (`src/components/dashboard/DashboardSidebar.tsx`)
- Eliminar la línea de "Incapacidades" (`{ title: "Incapacidades", url: null }`).

**2. Agregar tipo "Incapacidad" a PERMISSION_TYPES** (`src/pages/hr/HRPermisos.tsx`)
- Agregar `{ value: "incapacidad", label: "Incapacidad", icon: Stethoscope, color: "bg-red-500/10 text-red-600 border-red-500/30" }` al array `PERMISSION_TYPES`.

**3. Crear página `/hr/permisos/nuevo`**

- **Nuevo archivo**: `src/pages/hr/HRPermisoNew.tsx`
  - Layout: `flex flex-col h-full overflow-hidden`
  - **Header fijo** (`shrink-0 border-b`): Botón "Volver" con `ArrowLeft` + navigate(-1), título "Nueva Solicitud" con icono `Clock`, subtítulo.
  - **Contenido** (`flex-1 overflow-auto p-6`): Formulario con:
    - Empleado (EmployeeSearchCombobox)
    - Tipo de Permiso (Select con PERMISSION_TYPES ampliado)
    - Fecha (DatePicker)
    - Horario (Input, opcional)
    - Motivo (Textarea)
    - **Adjunto** (input file que acepta imagen/PDF, sube a un bucket de Supabase Storage y guarda la URL en `document_url` de la tabla `absences`)
  - **Footer fijo** (`shrink-0 border-t`): Botones "Cancelar" y "Crear Solicitud".

- **Storage**: Crear bucket `absence-documents` (público) vía migración SQL para almacenar los soportes.

**4. Registrar ruta** (`src/App.tsx`)
- Agregar ruta `/hr/permisos/nuevo` con `HRLayout` y `PermissionRoute module="HR"`.

**5. Modificar `HRPermisos.tsx`**
- Cambiar el botón "Solicitar Permiso" de `onClick={() => setModalOpen(true)}` a `navigate("/hr/permisos/nuevo")`.
- Eliminar el componente `CreatePermisoModal` y su estado `modalOpen`.

### Migración SQL
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('absence-documents', 'absence-documents', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload absence documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'absence-documents');

CREATE POLICY "Anyone can view absence documents"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'absence-documents');
```

