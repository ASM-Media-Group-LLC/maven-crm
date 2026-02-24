

## Manual de Operacion: Generador de Insights para Chatters

### Resumen

Enriquecer el componente `OperacionesTabContent` existente para incluir tres secciones nuevas: **Ficha de Personaje**, **Protocolo de Crisis** y una **Tabla de Precios** mejorada. Estos datos ya existen en la tabla `creators` (guardados desde los Pasos 2 y 4 del onboarding) y ya se traen en la query `useCreadorById`, por lo que no se necesitan cambios en la base de datos ni en el hook de datos.

---

### Cambios en detalle

**Archivo unico a modificar:** `src/pages/creadores/OperacionesTabContent.tsx`

#### Seccion 1: Ficha de Personaje (ya existe parcialmente como "Estilo de Chat")

Se ampliara la card existente para incluir:
- Tono de voz (ya presente)
- Emojis frecuentes (`emoji_frecuente`)
- Como quiere que la llamen (`como_quieres_que_te_llamen`)
- Personalidad de marca (`personalidad_marca`)
- Tono emocional (`tono_emocional`)
- Terminos de afecto preferidos (`terminos_afecto`)
- Frases de venta (`frases_venta`)

#### Seccion 2: Protocolo de Crisis (nueva)

Una card con icono de escudo que muestra los scripts de respuesta del Paso 2:
- "Si pide encuentro en persona" (`respuesta_sexo_en_persona`)
- "Si el usuario es grosero" (`respuesta_usuario_grosero`)
- "Si pide material gratis" (`respuesta_pedir_desnudos`)
- "Si pregunta cuanto cobra por encuentro" (`respuesta_cuanto_cobra_encuentro`)
- "Si pide muestras intimas" (`respuesta_muestra_intimas`)
- "Estrategia para material gratis" (`estrategia_material_gratis`)
- "Si tiene problemas personales" (`estrategia_problemas_personales`)
- "Estrategia de rechazo" (`estrategia_rechazo`)

Cada script se mostrara como un bloque con titulo en negrita y respuesta en texto normal, en un layout facil de consultar durante el chat.

#### Seccion 3: Tabla de Precios (ya existe, se mejora)

Se ampliara el mapa de etiquetas `priceLabels` para cubrir los 14 servicios del Paso 4, incluyendo los nuevos tipos:
- `zings`, `saludos`, `colaboraciones`, `sesiones_acompanamiento`, `videollamada_amistad`, `videollamada_otro`, `material_cortesia`, `material_sensual`

Se agregara indicacion de moneda usando el campo `currency` del creator.

#### Seccion 4: Informacion estrategica (nueva)

Card adicional con datos de la estrategia GFE y operativa del Paso 4:
- Disponibilidad GFE (`gfe_disponible`)
- Plataforma de videollamada preferida (`plataforma_videollamada`)
- Usuarios VIP (`usuarios_vip`)
- Estrategia de recuperacion (`estrategia_recuperacion`)
- Restricciones de seguridad (`restricciones_seguridad`)

---

### Actualizacion de la interfaz del componente

Se ampliara la interfaz `OperacionesTabContentProps` para incluir todos los campos nuevos que se leen del creator. Dado que `CreadorProfileContent` ya pasa el objeto `c` completo (que tiene todos los campos), solo se necesita tipar correctamente la prop.

---

### Sin cambios en base de datos

Todos los campos ya existen como columnas en la tabla `creators` (agregados en la migracion anterior). La query `useCreadorById` ya los trae con `select("*, creator_business(*)")`.

---

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/creadores/OperacionesTabContent.tsx` | Agregar Ficha de Personaje ampliada, Protocolo de Crisis, Tabla de Precios mejorada, e Info Estrategica |

