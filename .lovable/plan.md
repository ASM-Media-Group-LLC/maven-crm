

## Refinar Tabla de Precios - Paso 4

### Resumen

Dividir la fila "Videollamadas" en dos filas separadas y agregar placeholders de "Tiempo de entrega" en los campos de notas para servicios personalizados y colaboraciones.

---

### Cambios en Step4WorkConfig.tsx

**A. Array SERVICES (lineas 17-30)**: Reemplazar la entrada unica de Videollamadas por dos entradas:

| Antes | Despues |
|-------|---------|
| `{ key: "sesiones_video", label: "Videollamadas" }` | `{ key: "videollamada_amistad", label: "Videollamada Amistad" }` |
| | `{ key: "videollamada_otro", label: "Videollamada Otro" }` |

**B. Placeholders de notas**: Modificar el render de la tabla (linea ~131) para que los servicios `contenido_personalizado` y `colaboraciones_externas` muestren un placeholder especifico en el campo de notas:
- Placeholder: "Tiempo de entrega estimado..."
- El resto de servicios mantiene el placeholder generico "Observaciones..."

---

### Impacto en datos

- Los precios existentes guardados con la key `sesiones_video` no se migraran automaticamente (quedan como datos historicos en `precios_contenido`)
- Las nuevas keys `videollamada_amistad` y `videollamada_otro` se guardaran como entradas independientes en el JSONB
- No se requieren cambios en la base de datos ni en OnboardingWizard.tsx (el buildPayload ya itera dinamicamente sobre las keys del objeto pricing)

---

### Archivo a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/creadores/onboarding/steps/Step4WorkConfig.tsx` | Actualizar array SERVICES y condicionar placeholder de notas |

