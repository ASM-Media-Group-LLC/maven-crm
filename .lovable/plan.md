

## Ajustes de Estrategia Comercial - Paso 4

### Analisis del estado actual

La mayoria de los elementos solicitados **ya existen** en el Step 4:
- Switch de Acompanamiento Virtual (GFE) -- ya implementado
- Dropdown de Personalidad (Dulce, Directa, Juguetona, Dominante) -- ya implementado
- Dropdown de Tono Emocional (Romantico, Sensual) -- ya implementado
- Dropdown de Manejo de Limites / Estrategia de Rechazo (Humor, Firmeza, Rechazo suave) -- ya implementado
- 4 servicios adicionales en la tabla -- ya existen con keys similares

### Cambios necesarios

Solo faltan **2 ajustes**:

---

### 1. Renombrar labels de los 4 servicios existentes

Los servicios ya estan en la tabla pero con nombres ligeramente diferentes a los solicitados. Se actualizan los labels para alinearse con la terminologia del prompt:

| Key existente | Label actual | Label nuevo |
|---|---|---|
| `contenido_sensual_artistico` | Contenido Sensual Artistico | Material de Cortesia/Sensual |
| `saludos_personalizados` | Saludos Personalizados | Saludos a Medida |
| `colaboraciones_externas` | Colaboraciones Externas | Colaboraciones con Terceros |
| `interaccion_vivo_amistosa` | Interaccion en Vivo (Amistosa) | Sesiones de Acompanamiento |

Las keys se mantienen iguales para no romper datos existentes.

---

### 2. Agregar 2 campos de texto estrategico

Nuevos campos en la interfaz `Step4Data` y en la seccion "Configuracion de Interaccion":

| Campo | Tipo | Placeholder |
|---|---|---|
| `frasesVenta` | Textarea | "Describe tus terminos o frases favoritas para incentivar la compra de contenido (ej. Quieres ver algo especial?, Tengo una sorpresa para ti, etc.)" |
| `usuariosVip` | Textarea | "Detalla nombres de usuarios que requieren un manejo preferencial o instrucciones especificas de atencion" |

Se ubican al final de la seccion "Configuracion de Interaccion", despues del dropdown de Tono Emocional.

---

### Archivos a modificar

**1. `src/pages/creadores/onboarding/steps/Step4WorkConfig.tsx`**
- Lineas 26-29: Renombrar labels de los 4 servicios
- Linea 64: Agregar `frasesVenta: string` y `usuariosVip: string` a `Step4Data`
- Despues de linea 244 (cierre del dropdown Tono Emocional): Agregar 2 bloques de Textarea

**2. `src/pages/creadores/onboarding/OnboardingWizard.tsx`**
- Linea 26: Agregar `frasesVenta: ""` y `usuariosVip: ""` a `initialStep4`
- Linea 122: Agregar hidratacion de `frasesVenta` y `usuariosVip` desde `extraData`
- Linea 210: Agregar serializacion de ambos campos en `buildPayload`

