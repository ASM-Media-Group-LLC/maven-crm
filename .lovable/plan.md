

## Actualizar formulario de Onboarding con campos KASH

### Resumen

Ampliar el Paso 1 con campos de identidad y fisico (nombre artistico, cumpleanos, medidas, talla brasier), y convertir el Paso 2 de "Documentacion" a "Psicologia y Limites" con campos KASH (rutina, mascotas, contenido prohibido, etc.). Todo en layout de dos columnas. La documentacion actual del Paso 2 se mueve al Paso 3 o se fusiona.

### Cambios detallados

**Archivo 1: `src/pages/creadores/onboarding/steps/Step1PersonalInfo.tsx`**

Ampliar `Step1Data` con 4 campos nuevos:
- `artisticName` (string) - Nombre artistico
- `birthDate` (string) - Fecha de nacimiento (input type="date")
- `medidas` (string) - Medidas en cm (ej: "90-60-90")
- `tallaBrasier` (string) - Talla de brasier

Agregar los 4 inputs al grid de dos columnas, despues de los campos actuales y antes de la zona horaria:
- Nombre artistico (Input text)
- Fecha de nacimiento (Input date)
- Medidas (Input text, placeholder "90-60-90")
- Talla de brasier (Input text, placeholder "34B")

El layout ya usa `grid grid-cols-1 md:grid-cols-2 gap-4`, asi que solo se anaden filas al grid existente.

**Archivo 2: Nuevo `src/pages/creadores/onboarding/steps/Step2PsychologyLimits.tsx`**

Reemplaza el paso 2 actual. Interface `Step2PsyData`:
- `rutinaDiaria` (string)
- `hobbies` (string)
- `mascotasNombres` (string)
- `comidaFavorita` (string)
- `nivelEstudios` (string)
- `apodosPermitidos` (string)
- `palabrasProhibidas` (string)
- `emojiFrecuente` (string)
- `tonoVoz` (string)
- `contenidoJamasHaria` (string)

Layout con secciones claras separadas por subtitulos (h4 + separador):

1. **Seccion "Personalidad y Dia a Dia"** (grid 2 columnas)
   - Rutina diaria (Textarea, col-span-2)
   - Hobbies (Input)
   - Comida favorita (Input)
   - Mascotas y nombres (Input)
   - Nivel de estudios (Select: Bachillerato, Tecnico, Universitario, Postgrado, Otro)

2. **Seccion "Interaccion con Fans"** (grid 2 columnas)
   - Apodos permitidos (Input)
   - Palabras prohibidas (Input)
   - Emoji frecuente (Input)
   - Tono de voz (Select: Dulce, Picante, Dominante, Tierna, Directa, Juguetona)

3. **Seccion "Limites" con enfasis visual** (borde rojo/destructive sutil)
   - Contenido que JAMAS haria (Textarea, col-span-2, con icono de advertencia)

**Archivo 3: `src/pages/creadores/onboarding/OnboardingWizard.tsx`**

- Actualizar STEPS labels: Paso 2 pasa de "Documentacion" a "Psicologia y Limites"
- Actualizar `initialStep1` con los 4 campos nuevos (strings vacios)
- Agregar `initialStep2Psy` para el nuevo Step2PsyData (strings vacios)
- Mover la documentacion (Step2Documentation) al Paso 3, desplazando Step3 a Paso 3 tambien (fusionar) o mover a Paso 4
- Reordenar steps: 1-Personal, 2-Psicologia, 3-Documentacion+Perfil, 4-Configuracion
- Actualizar `buildPayload` para incluir los nuevos campos directamente en el objeto `creator` (ya existen las columnas en DB):
  - `artistic_name: step1.artisticName`
  - `birth_date: step1.birthDate`
  - `medidas_cm: step1.medidas`
  - `talla_brasier: step1.tallaBrasier`
  - `rutina_diaria`, `hobbies`, `mascotas_nombres`, etc. desde step2Psy
  - `contenido_jamas_haria` desde step2Psy
- Agregar state y callbacks para el nuevo step2Psy

### Reordenamiento de pasos

```text
Antes:                          Despues:
1. Informacion Personal         1. Informacion Personal (+ artistico, cumple, medidas)
2. Documentacion                2. Psicologia y Limites (NUEVO)
3. Perfil Profesional           3. Documentacion y Perfil (fusionados)
4. Configuracion                4. Configuracion (sin cambios)
```

Para no complicar la fusion de pasos 2+3, la documentacion se mantiene como Step 3 sin cambios y el perfil profesional pasa a compartir el Step 3 (se renderizan ambos secuencialmente dentro del mismo paso) o se deja la documentacion como sub-seccion del paso 3.

Alternativa mas simple: mantener 4 pasos exactos, solo reemplazar el contenido del paso 2:

```text
1. Informacion Personal (ampliado)
2. Psicologia y Limites (nuevo contenido)
3. Documentacion (sin cambios)
4. Configuracion (sin cambios)
```

El Step3 (Perfil Profesional) se elimina y sus datos (experience, workAreas, services, traits) se mueven al `internal_notes` JSON que ya se usa en buildPayload, o se integran en otro paso. Para mantener simple: Step3 queda como "Documentacion" (el actual Step2Documentation) y Step4 queda como "Configuracion" (el actual Step4WorkConfig que ya incluye horarios y notas).

### Archivos afectados

| Archivo | Cambio |
|---|---|
| `steps/Step1PersonalInfo.tsx` | Agregar 4 campos KASH al grid |
| `steps/Step2PsychologyLimits.tsx` | Nuevo archivo, reemplaza Step2Documentation en posicion |
| `OnboardingWizard.tsx` | Reordenar steps, nuevo state, actualizar buildPayload |

### Seccion tecnica

**Step1Data ampliado:**
```text
{ name, email, phone, age, country, city, timezone,
  artisticName, birthDate, medidas, tallaBrasier }
```

**Step2PsyData nuevo:**
```text
{ rutinaDiaria, hobbies, mascotasNombres, comidaFavorita,
  nivelEstudios, apodosPermitidos, palabrasProhibidas,
  emojiFrecuente, tonoVoz, contenidoJamasHaria }
```

**STEPS actualizado:**
```text
[
  { label: "Informacion Personal" },
  { label: "Psicologia y Limites" },
  { label: "Documentacion" },
  { label: "Configuracion" },
]
```

**buildPayload - campos nuevos en creator:**
```text
artistic_name: step1.artisticName || null,
birth_date: step1.birthDate || null,
medidas_cm: step1.medidas || null,
talla_brasier: step1.tallaBrasier || null,
rutina_diaria: step2Psy.rutinaDiaria || null,
hobbies: step2Psy.hobbies || null,
mascotas_nombres: step2Psy.mascotasNombres || null,
comida_favorita: step2Psy.comidaFavorita || null,
nivel_estudios: step2Psy.nivelEstudios || null,
apodos_permitidos: step2Psy.apodosPermitidos || null,
palabras_prohibidas: step2Psy.palabrasProhibidas || null,
emoji_frecuente: step2Psy.emojiFrecuente || null,
tono_voz: step2Psy.tonoVoz || null,
contenido_jamas_haria: step2Psy.contenidoJamasHaria || null,
```

El Step3ProfessionalProfile se elimina del flujo (sus datos ya se guardan en internal_notes). Los pasos quedan: Step1 -> Step2Psy -> Step2Documentation (ahora en posicion 3) -> Step4WorkConfig.

