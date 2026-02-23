

## Ajustar Tooltips en los 4 Pasos del Onboarding

### Resumen

Actualizar todos los textos de tooltips en los 4 pasos del onboarding con los textos proporcionados por el usuario, y agregar tooltips donde actualmente no existen (Paso 1 secciones, Paso 3 general, Paso 4 secciones).

---

### Archivos a modificar

| Archivo | Cambios |
|---------|---------|
| `OnboardingWizard.tsx` | Agregar tooltip general por paso junto al stepper label |
| `Step1PersonalInfo.tsx` | Agregar tooltips a secciones "Perfil Artistico" y "Privacidad" |
| `Step2PsychologyLimits.tsx` | Actualizar tooltips existentes en las 3 secciones |
| `Step2Documentation.tsx` (Paso 3) | Actualizar tooltips de Wishlist y Redes Sociales |
| `Step4WorkConfig.tsx` | Agregar tooltips a secciones Usuarios VIP, Frases de Venta, Horarios |

---

### Detalle de cambios por archivo

**1. OnboardingWizard.tsx** -- Agregar un tooltip con icono Info al lado de cada label del stepper (lineas 487-489). Se necesita importar Tooltip, TooltipProvider, TooltipTrigger, TooltipContent e Info.

| Paso | Tooltip |
|------|---------|
| 1 - Informacion Personal | "Datos basicos para validar tu identidad y generar tus contratos legales de forma segura." |
| 2 - Psicologia y Limites | "Ayudanos a clonar tu personalidad. Tus respuestas permiten que tu equipo venda exactamente como tu lo harias." |
| 3 - Documentacion | "Archivos necesarios para cumplir con la normativa de las plataformas y verificar la mayoria de edad." |
| 4 - Configuracion | "Tu menu comercial. Aqui defines que vendes y a que precio para que tu equipo cierre tratos de alto valor." |

Se envolvera el contenido del Card en un TooltipProvider.

**2. Step1PersonalInfo.tsx** -- Agregar tooltips a los SectionLabel de "Perfil Artistico" y "Privacidad". Se importara Tooltip, TooltipProvider, Info, y se envolvera el componente en TooltipProvider.

| Seccion | Tooltip |
|---------|---------|
| Perfil Artistico | "Define la identidad que veran tus fans. Estos datos son los que utilizara tu equipo de chat para mantener tu personaje." |
| Privacidad | "Tu controlas que datos reales compartimos. Estos ajustes protegen tu identidad fuera de la plataforma." |

Se modificara el SectionLabel para aceptar un prop `tooltip` opcional y renderizar el icono Info + Tooltip cuando se proporcione.

**3. Step2PsychologyLimits.tsx** -- Reemplazar los textos de los 3 tooltips existentes en las secciones del Accordion:

| Seccion | Tooltip actual | Tooltip nuevo |
|---------|----------------|---------------|
| Biografia y Gustos | "Esta informacion permite que tus operarios..." | "Detalles cotidianos que sirven para crear conexion emocional y 'mirroring' con tus suscriptores." |
| Personalidad y Tono | "Tus respuestas aqui definen el 'alma'..." | (Sin cambio especificado, se mantiene el actual) |
| Limites y Manejo de Crisis | "Vital para tu tranquilidad! Define de antemano..." (repetido en cada campo) | "Tus reglas de oro. Nos permite rechazar solicitudes prohibidas de forma firme y sin interrumpir tu dia." |

Tambien actualizar los tooltips repetidos en los campos individuales de "Limites" (lineas 276, 293, 310, 327, 344, 361, 378) con: "Tener respuestas preparadas para preguntas dificiles asegura ventas rapidas y consistencia total."

**4. Step2Documentation.tsx (Paso 3)** -- Actualizar los 2 tooltips existentes:

| Seccion | Tooltip actual | Tooltip nuevo |
|---------|----------------|---------------|
| Wishlist | "Permite a tu equipo gestionar regalos..." | "Facilita que tus fans te envien regalos. Es una de las formas mas efectivas de generar ingresos extra sin esfuerzo." |
| Redes Sociales | "Vital para la auditoria de marca..." | "Nos ayudan a estudiar tu estilo de comunicacion actual para replicar tu voz con precision en el chat." |

**5. Step4WorkConfig.tsx** -- Agregar tooltips con icono Info a las secciones del Accordion y campos especificos. Se importara Tooltip, TooltipProvider, TooltipTrigger, TooltipContent, Info.

| Seccion/Campo | Tooltip |
|---------------|---------|
| Usuarios VIP (label) | "Instrucciones de manejo para tus mejores clientes. Asegura que reciban el trato exclusivo por el que estan pagando." |
| Frases de Venta (label) | "Tus 'palabras magicas'. Usaremos tus expresiones unicas para cerrar ventas de forma natural y efectiva." |
| Horarios y Disponibilidad (accordion header) | "Vital para que el equipo sepa cuando estas disponible para generar contenido nuevo solicitado por fans." |

Se envolvera el Accordion en un TooltipProvider.

---

### Notas tecnicas

- Los tooltips generales del paso (stepper) se agregan al OnboardingWizard con un array de descripciones indexado
- No se requieren cambios en la base de datos ni en las interfaces de datos
- Se reutiliza el patron visual existente: icono Info de 3.5x3.5 con cursor-help y TooltipContent con max-w-xs

