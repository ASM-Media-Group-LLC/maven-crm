## Cambio

En `src/pages/cowork/CoworkParticipantView.tsx`, actualizar el texto del botón de la barra superior (vista desktop) de "Llamada privada" a "Llamada privada coordinador" para mantener consistencia con el dropdown móvil y la terminología actualizada.

### Detalle

**Desktop (línea ~290 aprox):**
```tsx
<Phone className="h-4 w-4" /> {isInOneOnOne ? "En llamada privada..." : "Llamada privada coordinador"}
```

El estado activo "En llamada privada..." y el item del dropdown móvil ("Llamada privada con coordinador") se mantienen sin cambios ya que ya reflejan el contexto correcto.

### Archivo modificado
- `src/pages/cowork/CoworkParticipantView.tsx`