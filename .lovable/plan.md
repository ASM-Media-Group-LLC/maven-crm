

## Convertir Contacto a Creador

### Objetivo
Implementar la funcionalidad del boton "Convertir a Creador" que actualmente muestra un mensaje de "Proximamente". Se creara un modal de confirmacion (siguiendo el patron de `ConvertLeadModal`) que transfiere los datos del contacto a la tabla `creators` y marca el contacto como "Convertido".

### Datos que se transferiran

| Campo Contacto | Campo Creator |
|---|---|
| nombre | name |
| instagram | instagram_handle |
| pais | country |
| categoria_fisica | category |
| telefono + country_code | phone, country_code |
| email | email |
| profile_photo_url | profile_photo_url |
| compania | (nota interna) |

### Archivos a crear/modificar

#### 1. Crear `src/pages/contactos/ConvertContactoModal.tsx`

Modal con el mismo estilo visual que `ConvertLeadModal`:
- Header con icono Sparkles y titulo "Convertir Contacto a Creador"
- Lista de datos que se transferiran (nombre, instagram, pais, categoria, telefono, email)
- Nota informativa indicando que el contacto quedara marcado como "Convertido"
- Botones Cancelar / Confirmar Conversion

Logica de la mutacion:
1. Insertar en `creators` con los datos mapeados
2. Actualizar `contactos` set `estado = 'Convertido'` where `id = contacto.id`
3. Invalidar queries `["contactos"]` y `["creators"]`

#### 2. Modificar `src/pages/contactos/ContactosContent.tsx`

- Agregar estados `convertOpen` y enlazar con `selectedContacto`
- Cambiar `handleConvert` para abrir el modal en lugar de mostrar toast
- Importar y renderizar `ConvertContactoModal`

### Sin cambios en DB
La tabla `creators` ya tiene todas las columnas necesarias. No se requieren migraciones.

### Detalle tecnico de la mutacion

```text
// 1. Insertar creator
supabase.from("creators").insert({
  name: contacto.nombre,
  instagram_handle: contacto.instagram,
  country: contacto.pais,
  category: contacto.categoria_fisica,
  phone: contacto.telefono,
  country_code: contacto.country_code,
  email: contacto.email,
  profile_photo_url: contacto.profile_photo_url,
  source: "contacto",
  status: "pendiente",
})

// 2. Marcar contacto como convertido
supabase.from("contactos").update({ estado: "Convertido" }).eq("id", contacto.id)
```

Nota: Para acceder a los campos raw de la DB (telefono, country_code, etc.) se usara el registro original de `dbContactos` en lugar del objeto `Contacto` mapeado, pasando el ID al modal y consultando el contacto completo, o bien ajustando el tipo `Contacto` para incluir los campos necesarios. La solucion mas limpia sera pasar el registro crudo de Supabase al modal.

