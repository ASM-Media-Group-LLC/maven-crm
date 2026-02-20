

## Nueva pestaña "Panel de Operaciones" en el perfil de Creadora

### Objetivo

Agregar una nueva pestaña llamada **"Operaciones"** como la primera pestaña del perfil de creadora, disenada para que los Chatters tengan toda la informacion operacional a la vista. Los datos se extraen automaticamente de los campos ya existentes en la base de datos.

### Estructura de la pestaña

La pestaña tendra 4 secciones visuales distintas:

**1. Tarjeta de Estilo de Chat**
- Tono de voz mostrado en grande (campo `tono_voz`)
- Apodos permitidos como badges (campo `apodos_permitidos`)
- Palabras prohibidas en rojo brillante (campo `palabras_prohibidas`)

**2. Muro de Contencion (Limites)**
- Seccion destacada con borde rojo/destructive
- Texto: "ESTA MODELO JAMAS HARA:" seguido del contenido del campo `contenido_jamas_haria`
- Icono de alerta para llamar la atencion

**3. Ganchos de Conversacion (Hooks)**
- Lista rapida con iconos para:
  - Hobbies (campo `hobbies`)
  - Mascotas (campo `mascotas_nombres`)
  - Comida favorita (campo `comida_favorita`)

**4. Resumen Comercial**
- Tabla de solo lectura con los precios del campo `precios_contenido` (JSONB)
- Columnas: Servicio, Precio, Notas
- Solo muestra servicios con precio mayor a 0

### Archivos a crear/modificar

| Archivo | Accion |
|---|---|
| `src/pages/creadores/OperacionesTabContent.tsx` | **Nuevo** — Componente con las 4 secciones descritas |
| `src/pages/creadores/CreadorProfileContent.tsx` | **Modificar** — Agregar la pestaña "Operaciones" como primera tab, importar el nuevo componente |

### Detalles tecnicos

- El componente recibe `creator` (tipo `CreatorFull`) como prop, sin necesidad de queries adicionales
- Los campos `apodos_permitidos` y `palabras_prohibidas` son strings de texto libre; se parsean separando por comas para mostrarlos como badges individuales
- `precios_contenido` es JSONB con estructura `{ [key]: { price: number, notes: string } }`
- Labels de precios mapeados: "Contenido X" (cat1), "Contenido XX" (cat2), "Contenido XXX" (cat3), "Backdoor" (cat4), "Contenido Personalizado", "D-Rating", "Videollamadas", "Venta de Ropa Interior"
- Cuando un campo no tiene datos, se muestra "Sin configurar" en texto muted
- Se usa el patron de Cards existente con bordes y bg-card del design system
