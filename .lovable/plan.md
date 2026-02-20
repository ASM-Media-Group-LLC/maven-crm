
## Unificacion de Experiencia de Usuario: Transiciones, Feedback y Limpieza

### Resumen
Conectar toda la experiencia del modulo de Onboarding y Creadores para que se sienta como un flujo continuo: animaciones de transicion, feedback visual con toasts, sidebar siempre sincronizado, y limpieza de la interfaz usando acordeones y tabs para reducir la sobrecarga visual.

---

### 1. Transiciones animadas entre tabla y wizard

**Archivo:** `src/pages/creadores/onboarding/OnboardingContent.tsx`

- Envolver la zona de contenido condicional (wizard vs tabla) con clases de animacion `animate-fade-in`
- Cuando `showWizard` cambia, el nuevo contenido aparece con un fade suave en lugar de un salto brusco
- Aplicar la misma animacion al cambiar entre vista tabla y grid

```text
{showWizard ? (
  <div className="animate-fade-in">
    <OnboardingWizard ... />
  </div>
) : (
  <div className="animate-fade-in">
    {/* tabs, filters, table/grid */}
  </div>
)}
```

### 2. Transiciones entre pasos del wizard

**Archivo:** `src/pages/creadores/onboarding/OnboardingWizard.tsx`

- Envolver el contenido de cada paso con `animate-fade-in` usando una `key={step}` para que React re-monte el div al cambiar de paso, activando la animacion

```text
<div key={step} className="animate-fade-in">
  {step === 1 && <Step1PersonalInfo ... />}
  {step === 2 && ...}
  ...
</div>
```

### 3. Feedback visual con Toasts (verificacion y completitud)

Los toasts ya estan implementados para "Borrador guardado" y "Onboarding completado" en `OnboardingWizard.tsx`. Se agregaran toasts adicionales:

**Archivo:** `src/pages/creadores/onboarding/OnboardingWizard.tsx`
- Al avanzar de paso: toast sutil confirmando el paso completado (solo en pasos con validacion exitosa)
- Al cancelar/volver a la lista: toast "Edicion cancelada" (siguiendo el patron estandar)

**Archivo:** `src/pages/creadores/VerificationSection.tsx`
- Verificar que los toasts de "Verificacion aprobada" y "Verificacion rechazada" ya estan presentes (ya lo estan)

### 4. Sidebar siempre sincronizado

**Archivo:** `src/components/dashboard/DashboardSidebar.tsx`

El sidebar ya maneja correctamente el resaltado:
- `isCreadoresActive` detecta `/creadores`, `/creadores/dashboard` y `/creadores/onboarding`
- El `Collapsible` se abre con `defaultOpen={isCreadoresActive}`
- Los sub-items usan `isActive={pathname === item.url}`

**Mejora necesaria:** Cuando el usuario esta en `/creadores/onboarding` y navega hacia el wizard (misma URL), el sub-item "Onboarding" ya se resalta. Sin embargo, para la ruta `/creadores/nuevo`, hay que verificar que tambien se resalte el grupo "Creadores".

- Agregar `/creadores/nuevo` a la deteccion de `isCreadoresActive` (ya deberia funcionar con `pathname.startsWith(item.url)` pero verificar)

### 5. Limpieza de interfaz: Acordeones en Step 4 (Configuracion)

**Archivo:** `src/pages/creadores/onboarding/steps/Step4WorkConfig.tsx`

El paso 4 tiene demasiada informacion visible simultaneamente (tabla de precios, config de interaccion, horarios, notas). Reorganizar usando acordeones:

- **Acordeon 1: "Precios por Servicio"** - Tabla de precios (abierto por defecto)
- **Acordeon 2: "Configuracion de Interaccion"** - Permiso identidad, orientacion, terminos de afecto, restricciones
- **Acordeon 3: "Horarios y Disponibilidad"** - Grid de horarios + objetivo mensual
- **Acordeon 4: "Notas Adicionales"** - Textarea de notas

Cada acordeon tendra un icono descriptivo (DollarSign, MessageCircle, Calendar, StickyNote) para facilitar la lectura rapida.

### 6. Limpieza de interfaz: Acordeones en Step 2 (Psicologia)

**Archivo:** `src/pages/creadores/onboarding/steps/Step2PsychologyLimits.tsx`

Actualmente usa `Separator` y secciones planas. Convertir a acordeones colapsables:

- **Acordeon 1: "Personalidad y Dia a Dia"** (abierto por defecto) - Rutina, hobbies, comida, mascotas, estudios
- **Acordeon 2: "Interaccion con Fans"** - Apodos, palabras prohibidas, emoji, tono
- **Acordeon 3: "Limites"** - Contenido que jamas haria

### 7. Reduccion de texto y consistencia visual

**Archivo:** `src/pages/creadores/onboarding/OnboardingContent.tsx`
- Reducir el subtitulo del header: "Gestiona el onboarding de nuevos creadores" (mas corto)
- Reducir labels de KPI cards: "Total" en lugar de "Total Onboarding"

**Archivo:** `src/pages/creadores/onboarding/OnboardingWizard.tsx`
- Reducir el subtitulo del card: "4 pasos para completar el registro" (mas conciso)

### 8. Fecha de nacimiento con Calendar Popover

**Archivo:** `src/pages/creadores/onboarding/steps/Step1PersonalInfo.tsx`

Reemplazar el `<Input type="date">` por el patron estandar de Popover + Calendar de Shadcn con locale en espanol (`es` de `date-fns`), segun la restriccion del sistema de diseno.

---

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/creadores/onboarding/OnboardingContent.tsx` | Animaciones fade-in en transiciones, textos mas concisos |
| `src/pages/creadores/onboarding/OnboardingWizard.tsx` | Animacion fade-in entre pasos, toast al cancelar, texto reducido |
| `src/pages/creadores/onboarding/steps/Step2PsychologyLimits.tsx` | Reorganizar con Accordion (3 secciones colapsables) |
| `src/pages/creadores/onboarding/steps/Step4WorkConfig.tsx` | Reorganizar con Accordion (4 secciones colapsables con iconos) |
| `src/pages/creadores/onboarding/steps/Step1PersonalInfo.tsx` | Reemplazar input date nativo por Popover + Calendar |

### Sin archivos nuevos

Todas las mejoras son refinamientos sobre componentes existentes usando utilidades CSS y componentes Shadcn ya disponibles en el proyecto (Accordion, Calendar, Popover).
