

# Persistencia de Leads y Contactos en Supabase

## Resumen
Crear dos tablas en Supabase (`leads` y `contactos`) y conectar los formularios existentes para que los datos se guarden y se muestren desde la base de datos.

## Paso 1: Crear tabla `leads`

Migracion SQL para crear la tabla con los campos del modal AddLeadModal:

```text
- id (uuid, PK)
- url_perfil (text, NOT NULL)
- plataforma (text, NOT NULL)
- categoria (text, NOT NULL)
- compania (text, NOT NULL)
- pais (text)
- notas (text)
- evidence_urls (text[]) -- URLs de archivos de evidencia subidos
- status (text, default 'nuevo')
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())
```

RLS: Politica permisiva ALL con `true` (igual que las demas tablas operativas del proyecto como events, tickets, etc.)

## Paso 2: Crear tabla `contactos`

Migracion SQL con los campos del modal AddContactoModal y del formulario NuevoContactoForm:

```text
- id (uuid, PK)
- nombre (text, NOT NULL)
- instagram (text, NOT NULL)
- categoria_fisica (text)
- compania (text)
- email (text)
- country_code (text, default '+57')
- telefono (text)
- ticket (text)
- notas (text)
- profile_photo_url (text)
- estado (text, default 'Nuevo')
- pais (text)
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())
```

RLS: Misma politica permisiva ALL con `true`.

Trigger `update_updated_at_column` en ambas tablas para actualizar `updated_at` automaticamente.

## Paso 3: Conectar AddLeadModal a Supabase

Modificar `src/pages/leadgen/AddLeadModal.tsx`:
- Importar `supabase` client
- En `onSubmit`: subir archivos de evidencia al bucket `creator-files` si existen, luego insertar el registro en la tabla `leads`
- Reemplazar el `setTimeout` falso por la insercion real
- Agregar manejo de errores

## Paso 4: Conectar AddContactoModal a Supabase

Modificar `src/pages/leadgen/AddContactoModal.tsx`:
- Importar `supabase` client
- En `onSubmit`: insertar en la tabla `contactos`
- Reemplazar el `setTimeout` falso

## Paso 5: Conectar NuevoContactoForm a Supabase

Modificar `src/pages/contactos/NuevoContactoForm.tsx`:
- En `handleSubmit`: insertar en la tabla `contactos` con todos los campos (incluyendo foto de perfil y archivos extras)

## Paso 6: Mostrar leads reales en la pestana Leads de LeadGen

Modificar `src/pages/leadgen/LeadGenContent.tsx`:
- Usar `useQuery` de TanStack para cargar leads desde Supabase
- Reemplazar el estado vacio actual por los datos reales en la pestana "leads"
- Mostrar los leads en una tabla con columnas: URL, Plataforma, Categoria, Compania, Pais, Estado, Fecha
- Actualizar el contador de leads en el header

## Paso 7: Mostrar contactos reales en el Directorio de Contactos

Modificar `src/pages/contactos/ContactosContent.tsx`:
- Usar `useQuery` para cargar contactos desde Supabase
- Reemplazar `mockContactos` por datos reales
- Mantener los filtros y la logica de vista existente
- Generar ticket IDs automaticamente

## Archivos a modificar
- `src/pages/leadgen/AddLeadModal.tsx` - conectar insert de leads
- `src/pages/leadgen/AddContactoModal.tsx` - conectar insert de contactos
- `src/pages/contactos/NuevoContactoForm.tsx` - conectar insert de contactos
- `src/pages/leadgen/LeadGenContent.tsx` - cargar y mostrar leads reales
- `src/pages/contactos/ContactosContent.tsx` - cargar y mostrar contactos reales

## Nota importante
Como no hay autenticacion implementada, las tablas usaran politicas RLS permisivas (igual que las demas tablas del proyecto). No se requiere `user_id` en este momento.

