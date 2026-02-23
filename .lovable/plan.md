

## Tooltips informativos por seccion en Paso 2

### Resumen

Reemplazar los tooltips genericos actuales por mensajes especificos y persuasivos para cada seccion, y agregar tooltips nuevos en las secciones que aun no los tienen (Biografia y Personalidad).

---

### Cambios en Step2PsychologyLimits.tsx

**1. Seccion A - Biografia y Gustos (lineas 70-74)**
Agregar un icono Info con tooltip al lado del titulo del AccordionTrigger:
- Texto: "Esta informacion permite que tus operarios encuentren temas de conversacion en comun con tus suscriptores. Saber tus gustos ayuda a generar confianza y aumentar las propinas mediante la conexion real."

**2. Seccion B - Personalidad y Tono (lineas 166-169)**
Agregar un icono Info con tooltip al lado del titulo del AccordionTrigger:
- Texto: "Tus respuestas aqui definen el 'alma' de tu cuenta. Al saber como te describes y que emojis usas, tu equipo de chat podra hablar exactamente como tu, evitando que los fans sospechen que hay alguien mas detras de la pantalla."

**3. Seccion C - Limites y Manejo de Crisis (lineas 225-228)**
Agregar un icono Info con tooltip al lado del titulo del AccordionTrigger:
- Texto: "Vital para tu tranquilidad! Define de antemano como responder a situaciones incomodas. Esto nos permite manejar solicitudes dificiles (como encuentros fisicos o contenido gratuito) bajo tus propias reglas y sin tener que interrumpir tu dia para preguntarte."

**4. Tooltips individuales de los campos de crisis (lineas 258, 275, 292, 309, 326, 343, 360)**
Actualizar los 7 tooltips existentes en los campos de script de la seccion C. Reemplazar el texto generico "Esto ayudara a nuestros chatters a hablar exactamente como tu" por el nuevo texto de seccion: "Vital para tu tranquilidad! Define de antemano como responder a situaciones incomodas. Esto nos permite manejar solicitudes dificiles bajo tus propias reglas y sin tener que interrumpir tu dia para preguntarte."

---

### Detalle tecnico

Cada titulo de seccion (AccordionTrigger) pasara de:

```text
<BookOpen icon /> Biografia y Gustos
```

a:

```text
<BookOpen icon /> Biografia y Gustos <Info icon con Tooltip>
```

Se usa el mismo patron de `Tooltip > TooltipTrigger > Info icon > TooltipContent` que ya existe en los campos de crisis, con `max-w-xs` en el TooltipContent para que el texto largo no se desborde.

---

### Archivo a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/creadores/onboarding/steps/Step2PsychologyLimits.tsx` | Agregar tooltips a los 3 titulos de seccion y actualizar texto de los 7 tooltips existentes |

