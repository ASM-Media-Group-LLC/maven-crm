

## Ampliar tabla `creators` con campos KASH

### Resumen

Agregar columnas dedicadas a la tabla `creators` para almacenar la informacion estrategica del cuestionario KASH, organizadas en 6 categorias: Identidad, Fisico, Psicologia, Interaccion, Limites y Precios.

### Columnas existentes que ya cubren parte del requerimiento

| Requerimiento | Columna existente |
|---|---|
| nombre_artistico | `artistic_name` (text) |
| fecha_nacimiento | `birth_date` (date) |

Estas NO se duplican.

### Columnas nuevas a crear via migracion

**Identidad:**
- `signo_zodiacal` (text, nullable)
- `wishlist_url` (text, nullable)

**Fisico:**
- `estatura` (text, nullable) -- ej: "1.65m"
- `medidas_cm` (text, nullable) -- ej: "90-60-90"
- `talla_brasier` (text, nullable)
- `tatuajes_piercings_detalle` (text, nullable)

**Psicologia:**
- `rutina_diaria` (text, nullable)
- `hobbies` (text, nullable)
- `mascotas_nombres` (text, nullable)
- `comida_favorita` (text, nullable)
- `nivel_estudios` (text, nullable)

**Interaccion:**
- `apodos_permitidos` (text, nullable)
- `palabras_prohibidas` (text, nullable)
- `emoji_frecuente` (text, nullable)
- `tono_voz` (text, nullable)

**Limites:**
- `contenido_jamas_haria` (text, nullable)

**Precios:**
- `precios_contenido` (jsonb, nullable, default '{}') -- Objeto JSON con claves: x, xx, xxx, anal, zing, dick_rating, ropa_interior

### Seccion tecnica

**Migracion SQL:**

```sql
ALTER TABLE creators
  ADD COLUMN IF NOT EXISTS signo_zodiacal text,
  ADD COLUMN IF NOT EXISTS wishlist_url text,
  ADD COLUMN IF NOT EXISTS estatura text,
  ADD COLUMN IF NOT EXISTS medidas_cm text,
  ADD COLUMN IF NOT EXISTS talla_brasier text,
  ADD COLUMN IF NOT EXISTS tatuajes_piercings_detalle text,
  ADD COLUMN IF NOT EXISTS rutina_diaria text,
  ADD COLUMN IF NOT EXISTS hobbies text,
  ADD COLUMN IF NOT EXISTS mascotas_nombres text,
  ADD COLUMN IF NOT EXISTS comida_favorita text,
  ADD COLUMN IF NOT EXISTS nivel_estudios text,
  ADD COLUMN IF NOT EXISTS apodos_permitidos text,
  ADD COLUMN IF NOT EXISTS palabras_prohibidas text,
  ADD COLUMN IF NOT EXISTS emoji_frecuente text,
  ADD COLUMN IF NOT EXISTS tono_voz text,
  ADD COLUMN IF NOT EXISTS contenido_jamas_haria text,
  ADD COLUMN IF NOT EXISTS precios_contenido jsonb DEFAULT '{}';
```

**Sin cambios en archivos de codigo** en este paso. Las columnas quedan disponibles para que los formularios las consuman en pasos posteriores. El tipo generado por Supabase (`types.ts`) se actualizara automaticamente tras la migracion.

**Nota:** `artistic_name` y `birth_date` ya existen y no se tocan. El campo `precios_contenido` es un JSONB que permite guardar un objeto flexible como:

```json
{
  "x": 15,
  "xx": 25,
  "xxx": 40,
  "anal": 50,
  "zing": 10,
  "dick_rating": 20,
  "ropa_interior": 30
}
```

### Archivos afectados

| Archivo | Cambio |
|---|---|
| Nueva migracion SQL | ALTER TABLE con 17 columnas nuevas |
| Codigo fuente | Sin cambios en este paso |

