

## Rediseno del Modal de Permisos

### Cambios visuales (basado en la imagen de referencia)

#### 1. Layout de 3 columnas con encabezados

Se agregaran encabezados de columna: **Menus**, **Function permissions**, **Data permissions**. La fila global tendra:
- Checkbox "All" para menus (toggle todos los modulos)
- Checkbox "All" para funciones (toggle todos los submodulos)
- RadioGroup global para data permissions (All data / Self and subordinates / Data about self)

#### 2. Cada modulo como card con borde

Cada modulo se mostrara como una tarjeta con borde (`border rounded-lg p-4`), conteniendo:
- **Fila principal**: Checkbox + nombre del modulo + conteo de funciones ("X funciones") + etiqueta del data scope actual ("All data")
- **"Ver detalles"** como trigger expandible con chevron a la derecha
- **Contenido expandido**: A la izquierda los submodulos (o "No functions available" si no tiene), a la derecha el RadioGroup con las 3 opciones de data scope

#### 3. Titulo y subtitulo actualizados

- Titulo: "Set permissions for **[RoleName]**"
- Subtitulo (DialogDescription): "Configure granular permissions for this role"

#### 4. Modal mas ancho

Se aumentara el ancho maximo a `sm:max-w-3xl` para acomodar las 3 columnas.

---

### Seccion tecnica

**Archivo a modificar:**
- `src/pages/admin/SetPermissionsModal.tsx` - Reescritura completa del layout interno

**Estructura de cada card de modulo:**

```text
+------------------------------------------------------+
| [x] Dashboard    0 funciones              All data   |
| Ver detalles                                    v    |
|------------------------------------------------------|
|          No functions available    o All data         |
|                                   o Self and subord. |
|                                   o Data about self  |
+------------------------------------------------------+
```

**Logica de "All" para funciones:**
- El checkbox "All" de funciones iterara sobre todos los submodulos de todos los modulos y los marcara/desmarcara
- El conteo "X funciones" por modulo mostrara cuantos submodulos estan habilitados vs total

**Labels de data scope en la fila resumida:**
- Se mostrara el data_scope actual del modulo como texto ("All data", "Self and subordinates", "Data about self") junto al nombre

