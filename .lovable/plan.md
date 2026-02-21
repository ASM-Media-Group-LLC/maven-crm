

## Mejora del Selector de Mes/Año en DateInput

El componente `DateInput` ya esta en uso en el wizard de evaluaciones. El problema es que los dropdowns de mes y año dentro del calendario usan elementos `<select>` nativos del navegador, cuyo estilo visual no es consistente con el resto del design system.

---

### Cambio propuesto

Mejorar el estilo de la clase `dropdown` en el `DateInput` para que los selectores nativos se vean mas pulidos y consistentes:

- Aumentar el contraste y legibilidad
- Agregar fondo solido (`bg-background`) en lugar de transparente
- Mejorar el hover y focus states
- Ajustar padding y tipografia para consistencia

### Archivo a modificar

| Archivo | Cambio |
|---|---|
| `src/components/ui/date-input.tsx` | Actualizar la clase `dropdown` en `classNames` del `DayPicker` para mejorar el estilo visual de los selectores nativos de mes y anio: fondo solido, bordes mas visibles, mejor hover/focus, tipografia consistente |

### Detalle tecnico

Se actualiza la propiedad `dropdown` en el objeto `classNames` del `DayPicker`:

**Antes:**
```text
dropdown: "appearance-none bg-transparent border border-border rounded-md px-2 py-1 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
```

**Despues:**
```text
dropdown: "bg-background border border-border rounded-md px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 cursor-pointer hover:bg-muted transition-colors"
```

El cambio es minimo y solo afecta la apariencia visual, no la funcionalidad.

