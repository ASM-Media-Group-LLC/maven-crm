

## Paso 4: Ampliar Tabla de Servicios con 4 nuevas categorias

### Resumen

Agregar 4 nuevas filas a la tabla de precios del Step 4 para cubrir servicios adicionales del Excel. No se requieren cambios en el wizard ni en la base de datos ya que el pricing es un `Record` dinamico.

### Archivo a modificar

**`src/pages/creadores/onboarding/steps/Step4WorkConfig.tsx`** - Lineas 15-25 (array SERVICES)

### Servicios a agregar

Se insertan las siguientes 4 entradas al array `SERVICES`, despues de "Zings":

| Key | Label | Descripcion en notas placeholder |
|-----|-------|----------------------------------|
| `contenido_sensual_artistico` | Contenido Sensual Artistico | Fotos/videos en lenceria sin material explicito |
| `saludos_personalizados` | Saludos Personalizados | Videos cortos de saludo |
| `colaboraciones_externas` | Colaboraciones Externas | Contenido con otros perfiles |
| `interaccion_vivo_amistosa` | Interaccion en Vivo (Amistosa) | Acompanamiento no explicito |

### Array SERVICES resultante (13 servicios)

```text
1. Contenido X
2. Contenido XX
3. Contenido XXX
4. Backdoor
5. Contenido Personalizado
6. D-Rating
7. Videollamadas
8. Venta de Ropa Interior
9. Zings
10. Contenido Sensual Artistico  (NUEVO)
11. Saludos Personalizados       (NUEVO)
12. Colaboraciones Externas      (NUEVO)
13. Interaccion en Vivo (Amistosa) (NUEVO)
```

### Sin cambios adicionales

No se requieren cambios en `OnboardingWizard.tsx` ni en la BD. El campo `pricing` es `Record<string, ServicePricing>` y `precios_contenido` es JSONB, por lo que las nuevas keys se persisten automaticamente.

