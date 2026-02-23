

## Rediseno de la seccion "Onboardings en Curso"

Se reemplaza la seccion actual de "Procesos en Curso" (scroll horizontal con tarjetas pequenas) por una seccion completa con grid de cards, empty state y boton "Continuar" que abre el wizard inline.

---

### Cambios en `OnboardingContent.tsx`

**1. Seccion "Onboardings en Curso" rediseñada (reemplaza lineas 98-136)**

- Titulo "Onboardings en Curso" con icono y badge de conteo
- Grid responsivo (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`)
- Cada tarjeta (Card) incluye:
  - Avatar circular con iniciales + nombre (o "Borrador sin nombre")
  - Barra de progreso delgada (h-1.5) con color primary
  - Badge con texto descriptivo del paso faltante (ej: "Falta Documentacion", "Paso 2 incompleto")
  - Boton secundario "Continuar" que oculta el grid y abre el wizard en el paso correcto
- La seccion se muestra siempre (no solo cuando hay datos)

**2. Empty State**

Cuando `inProgressCreators.length === 0`:
- Contenedor centrado con borde fino y fondo sutil
- Icono de carpeta (FolderOpen) en gris
- Texto: "No hay onboardings en curso. Haz clic en + Iniciar Onboarding para registrar una nueva creadora."

**3. Interaccion**

- El boton "Continuar" en cada card llama a `handleCardClick(creator)` que ya existe y abre el wizard inline en el paso correcto
- El wizard se muestra integrado en la pagina (ya funciona asi), no en modal

### Archivo a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/creadores/onboarding/OnboardingContent.tsx` | Reemplazar seccion "Procesos en Curso" por grid de cards con avatar, progreso, badge descriptivo, boton "Continuar" y empty state con icono FolderOpen |

### Detalle tecnico

La seccion de cards usa los datos de `inProgressCreators` (ya calculado con filtro `borrador` o `pendiente_verificacion`). Se reutilizan `calculateCurrentStep` y `getStepLabel` para determinar progreso y etiqueta. El nombre fallback es "Borrador sin nombre" cuando `creator.name` esta vacio. El boton "Continuar" invoca `handleCardClick` existente. La seccion siempre se renderiza cuando `!showWizard`, mostrando el empty state si no hay datos.

