

## Paso 2 Expandido: Psicologia y Limites (El Manual del Personaje)

### Resumen

Reemplazar el contenido actual del Step 2 con 3 secciones colapsables (Acordeones) mucho mas completas, agregando campos nuevos para biografia detallada, personalidad/tono y manejo de crisis. Los campos existentes se mantienen y se redistribuyen en las nuevas secciones.

---

### Archivos a modificar

**1. `src/pages/creadores/onboarding/steps/Step2PsychologyLimits.tsx`** - Reescribir UI con 3 acordeones expandidos
**2. `src/pages/creadores/onboarding/OnboardingWizard.tsx`** - Extender `Step2PsyData`, `initialStep2Psy`, carga y payload

---

### Campos nuevos a agregar en Step2PsyData

| Campo | Tipo | Columna BD | Almacenamiento |
|-------|------|------------|----------------|
| `heladoFavorito` | string | -- | `internal_notes` JSON |
| `bebidaFavorita` | string | -- | `internal_notes` JSON |
| `musicaArtistas` | string | -- | `internal_notes` JSON |
| `peliculasTV` | string | -- | `internal_notes` JSON |
| `viajesFavoritos` | string | -- | `internal_notes` JSON |
| `viajesPorVisitar` | string | -- | `internal_notes` JSON |
| `hermanos` | string | -- | `internal_notes` JSON |
| `diaPerecto` | string | -- | `internal_notes` JSON |
| `comoEresCuandoNadieVe` | string | -- | `internal_notes` JSON |
| `comoQuieresQueTeLlamen` | string | -- | `internal_notes` JSON |
| `respuestaSexoEnPersona` | string | -- | `internal_notes` JSON |
| `respuestaUsuarioGrosero` | string | -- | `internal_notes` JSON |
| `respuestaPedirDesnudos` | string | -- | `internal_notes` JSON |
| `queTeIncomoda` | string | -- | `internal_notes` JSON |

**Campos que ya existen y se mantienen:** `rutinaDiaria`, `hobbies`, `mascotasNombres`, `comidaFavorita`, `nivelEstudios`, `apodosPermitidos`, `palabrasProhibidas`, `emojiFrecuente`, `tonoVoz`, `contenidoJamasHaria`

---

### Cambio 1: Step2PsychologyLimits.tsx (UI completa)

Reorganizar en 3 acordeones:

**Seccion A: "Biografia y Gustos"** (icono: BookOpen)
- Hobbies (existente)
- Rutina diaria (existente, textarea)
- Comida favorita (existente) | Helado favorito (nuevo)
- Bebida favorita (nuevo) | Musica/Artistas (nuevo)
- Peliculas/TV (nuevo) | Mascotas y nombres (existente)
- Viajes favoritos (nuevo) | Destinos por visitar (nuevo)
- Hermanos/Hijos (nuevo) | Nivel de estudios (existente, select)

**Seccion B: "Personalidad y Tono"** (icono: Sparkles)
- Dia perfecto (nuevo, textarea)
- Como eres cuando nadie te ve (nuevo, textarea)
- Como quieres que te llamen los fans (nuevo, input - ej: "Diosa, Reina, Princesa")
- Apodos permitidos (existente)
- Palabras prohibidas (existente)
- Emojis mas usados (existente)
- Tono de voz (existente, select)

**Seccion C: "Limites y Manejo de Crisis"** (icono: ShieldAlert, borde rojo)
- Contenido que JAMAS harias (existente, textarea con borde rojo)
- Que te incomoda (nuevo, textarea)
- Como responderias si un usuario pide sexo en persona (nuevo, textarea)
- Como manejas a un usuario grosero (nuevo, textarea)
- Como respondes a "quiero ver tus desnudos" (nuevo, textarea)

Cada seccion C tendra un fondo suave de alerta (bg-destructive/5) para resaltar la importancia.

### Cambio 2: OnboardingWizard.tsx

- Extender la interfaz `Step2PsyData` con los 14 campos nuevos (todos string, default `""`)
- Actualizar `initialStep2Psy` con los valores vacios
- En el `useEffect` de carga, leer los nuevos campos desde `internal_notes` JSON (los campos existentes ya se leen de columnas directas)
- En `buildPayload`, agregar los 14 campos nuevos al objeto `extraData` que se serializa en `internal_notes`

### Layout visual del Paso 2 actualizado

```text
[Acordeon A: Biografia y Gustos - abierto por defecto]
  [Hobbies]                    [Comida favorita]
  [Helado favorito]            [Bebida favorita]
  [Musica/Artistas]            [Peliculas/TV]
  [Mascotas y nombres]         [Hermanos/Hijos]
  [Viajes favoritos]           [Destinos por visitar]
  [Nivel de estudios (select)] 
  [Rutina diaria (textarea full width)]

[Acordeon B: Personalidad y Tono]
  [Dia perfecto (textarea full width)]
  [Como eres cuando nadie te ve (textarea full width)]
  [Como quieres que te llamen]  [Apodos permitidos]
  [Palabras prohibidas]         [Emojis mas usados]
  [Tono de voz (select)]

[Acordeon C: Limites y Manejo de Crisis - borde rojo]
  [Contenido que JAMAS harias (textarea full width)]
  [Que te incomoda (textarea full width)]
  [Respuesta: sexo en persona (textarea full width)]
  [Respuesta: usuario grosero (textarea full width)]
  [Respuesta: pedir desnudos (textarea full width)]
```

