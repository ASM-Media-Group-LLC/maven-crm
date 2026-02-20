

## Sección "Procesos en Curso" en Onboarding

### Objetivo

Agregar una fila de tarjetas horizontales debajo de los KPIs que muestre las creadoras con status `borrador` o `pendiente_verificacion`, indicando su progreso en el wizard de 4 pasos. Al hacer clic en una tarjeta, se abre el wizard pre-cargado en el paso donde se quedaron.

### Logica para determinar el paso actual

Se evalua la completitud de datos de cada creadora para determinar en que paso se detuvo:

| Paso completado | Condicion |
|---|---|
| Paso 1 listo | `name` y `email` y `country` tienen valor |
| Paso 2 listo | Paso 1 listo + al menos 2 campos de psicologia tienen valor (`rutina_diaria`, `hobbies`, `tono_voz`, etc.) |
| Paso 3 listo | Paso 2 listo + `profile_photo_url` tiene valor |
| Paso 4 (final) | status es `pendiente_verificacion` |

El "paso actual" es el primer paso no completado. Si todos estan listos y el status es `pendiente_verificacion`, se muestra "Pendiente de aprobacion".

### Etiquetas segun el paso

| Paso actual | Etiqueta mostrada |
|---|---|
| 1 | "Completando datos personales" |
| 2 | "Completando perfil psicologico" |
| 3 | "Esperando documentos" |
| 4 | "Configurando precios" |
| Completado (pendiente_verificacion) | "Pendiente de aprobacion" |

### Diseno de las tarjetas

Cada tarjeta es un `Card` interactivo con:
- Nombre de la creadora (font-medium)
- Mini `Progress` bar (h-1.5) con valor = `(pasoActual - 1) / 4 * 100`
- Texto "Paso X de 4" en text-xs
- Badge con la etiqueta descriptiva
- Hover con `hover:border-primary/40 hover:bg-primary/5 hover:-translate-y-[1px]`
- Cursor pointer

Layout: scroll horizontal con `flex gap-3 overflow-x-auto pb-2` dentro de un `Card` contenedor con header "Procesos en Curso" + icono `RefreshCw` + badge con cantidad.

### Cambios en el Wizard

El `OnboardingWizard` necesita aceptar props opcionales para:
- `initialStep`: numero del paso donde abrir (default 1)
- `editCreatorId`: UUID del creador existente que se esta editando
- `initialData`: datos pre-cargados del creador (step1, step2Psy, step3Doc, step4)

Cuando se abre con un creador existente, el wizard carga sus datos en los estados internos y navega al paso indicado. Al guardar, hace `update` en lugar de `insert`.

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/creadores/onboarding/OnboardingContent.tsx` | Agregar seccion "Procesos en Curso" entre KPIs y tabla. Agregar estado para `editingCreator`. Pasar props al wizard. |
| `src/pages/creadores/onboarding/OnboardingWizard.tsx` | Aceptar `initialStep`, `editCreatorId`, `initialData`. Pre-cargar datos. Usar update si `editCreatorId` existe. |
| `src/pages/creadores/onboarding/useOnboarding.ts` | Expandir el query para incluir campos de psicologia y documentos necesarios para calcular el paso. Exportar un helper `calculateCurrentStep`. |

### Flujo de interaccion

1. El usuario entra a `/creadores/onboarding`
2. Ve los KPIs arriba
3. Debajo, ve la seccion "Procesos en Curso" con tarjetas de creadoras en borrador/pendiente
4. Hace clic en una tarjeta
5. El wizard se abre directamente en el paso donde se quedo, con los datos pre-cargados
6. Al guardar, se actualiza el registro existente (no se crea uno nuevo)

### Detalles tecnicos

**Calculo del paso (helper en useOnboarding.ts):**

```ts
function calculateCurrentStep(creator: any): number {
  const hasStep1 = creator.name && creator.email && creator.country;
  if (!hasStep1) return 1;
  
  const psyFields = [creator.rutina_diaria, creator.hobbies, creator.tono_voz, 
                      creator.emoji_frecuente, creator.contenido_jamas_haria];
  const hasStep2 = psyFields.filter(Boolean).length >= 2;
  if (!hasStep2) return 2;
  
  const hasStep3 = !!creator.profile_photo_url;
  if (!hasStep3) return 3;
  
  return 4;
}
```

**Seccion visual (en OnboardingContent.tsx):**

Se renderiza solo cuando `!showWizard` y hay procesos en curso. Envuelta en un `Card` con `CardHeader` y `CardContent` siguiendo el patron estandar de la plataforma.

**Props del Wizard actualizadas:**

```ts
interface Props {
  onCancel: () => void;
  initialStep?: number;
  editCreatorId?: string;
  initialData?: { step1, step2Psy, step3Doc, step4 };
}
```

Cuando `editCreatorId` esta presente, el `handleSubmit` usa `supabase.from("creators").update(...)` en lugar de la mutacion `addCreador`.

