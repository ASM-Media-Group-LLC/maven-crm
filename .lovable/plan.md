

## Transformar Paso 4 en Tabla de Precios de Servicios

### Resumen

Reemplazar los inputs sueltos de tarifa/objetivo en Step4WorkConfig por una tabla de precios profesional donde cada fila es un servicio y las columnas son "Precio sugerido ($)" y "Notas del servicio". Los valores se guardan en el campo JSONB `precios_contenido` de la tabla `creators`. Se mantiene la grilla de horarios y las notas adicionales.

### Cambios en Step4WorkConfig.tsx

Actualizar la interface `Step4Data` para incluir un campo `pricing` que almacene los precios y notas por servicio:

```text
interface ServicePricing {
  price: string;
  notes: string;
}

interface Step4Data {
  schedule: ScheduleGrid;
  pricing: Record<string, ServicePricing>;
  monthlyGoal: string;
  notes: string;
}
```

Se elimina `hourlyRate` (se reemplaza por la tabla de precios por servicio).

**Servicios (filas de la tabla):**
1. Categoria 1
2. Categoria 2
3. Categoria 3
4. Categoria 4
5. Contenido Personalizado
6. Valoracion de Medios
7. Sesiones de Video en Vivo
8. Envio de Articulos Fisicos

**Columnas:**
- Servicio (nombre fijo, no editable)
- Precio sugerido ($) (Input number con prefijo $)
- Notas del servicio (Input text)

La tabla usa los componentes `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` del design system existente, con borde redondeado y estilo consistente con la tabla de horarios que ya existe en el mismo paso.

### Cambios en OnboardingWizard.tsx

**initialStep4 actualizado:**
```text
{ schedule: {}, pricing: {}, monthlyGoal: "", notes: "" }
```

**buildPayload - mapeo de pricing a precios_contenido:**

Transformar `step4.pricing` en el objeto JSONB que espera la columna `precios_contenido`:

```text
precios_contenido: {
  cat_1: { price: 15, notes: "..." },
  cat_2: { price: 25, notes: "..." },
  cat_3: { price: 40, notes: "..." },
  cat_4: { price: 50, notes: "..." },
  contenido_personalizado: { price: 10, notes: "..." },
  valoracion_medios: { price: 20, notes: "..." },
  sesiones_video: { price: 30, notes: "..." },
  envio_articulos: { price: 15, notes: "..." },
}
```

Solo se incluyen servicios donde el usuario ingreso un precio > 0. El campo `hourlyRate` se elimina del payload (ya no existe en `extraData` de `internal_notes`).

### Archivos afectados

| Archivo | Cambio |
|---|---|
| `steps/Step4WorkConfig.tsx` | Reemplazar inputs de tarifa por tabla de precios con 8 servicios |
| `OnboardingWizard.tsx` | Actualizar initialStep4, buildPayload para mapear pricing a precios_contenido |

### Seccion tecnica

**Claves de servicio (keys internos):**

| Servicio | Key |
|---|---|
| Categoria 1 | `cat_1` |
| Categoria 2 | `cat_2` |
| Categoria 3 | `cat_3` |
| Categoria 4 | `cat_4` |
| Contenido Personalizado | `contenido_personalizado` |
| Valoracion de Medios | `valoracion_medios` |
| Sesiones de Video en Vivo | `sesiones_video` |
| Envio de Articulos Fisicos | `envio_articulos` |

**Estructura visual de la tabla:**

```text
+-----------------------------------+--------------------+------------------------+
| Servicio                          | Precio sugerido ($)| Notas del servicio     |
+-----------------------------------+--------------------+------------------------+
| Categoria 1                       | $ [___]            | [________________]     |
| Categoria 2                       | $ [___]            | [________________]     |
| Categoria 3                       | $ [___]            | [________________]     |
| Categoria 4                       | $ [___]            | [________________]     |
| Contenido Personalizado           | $ [___]            | [________________]     |
| Valoracion de Medios              | $ [___]            | [________________]     |
| Sesiones de Video en Vivo         | $ [___]            | [________________]     |
| Envio de Articulos Fisicos        | $ [___]            | [________________]     |
+-----------------------------------+--------------------+------------------------+
```

**Layout final del Paso 4:**
1. Tabla de precios de servicios (nuevo)
2. Objetivo mensual de ingresos (se mantiene, input unico)
3. Grilla de horarios semanales (se mantiene sin cambios)
4. Notas adicionales (se mantiene sin cambios)

