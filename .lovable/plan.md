

## Mejora de Date Pickers y Phone Inputs en toda la plataforma

### Problema actual

1. **Date pickers**: Varios formularios usan `<Input type="date" />` (nativo HTML) que hace dificil cambiar el ano. Otros usan `Popover + Calendar` pero sin opcion de escribir la fecha manualmente. Ninguno permite ambas formas (escribir + seleccionar).
2. **Phone inputs**: Los campos de telefono son inputs de texto plano sin selector de codigo de pais.

---

### Solucion

#### A. Nuevo componente reutilizable: `DateInput`

Crear `src/components/ui/date-input.tsx` que combine:
- Un `Input` donde el usuario puede escribir la fecha en formato `dd/mm/yyyy`
- Un boton con icono de calendario que abre un `Popover + Calendar` con soporte para navegar anios facilmente (`captionLayout="dropdown-buttons"` y props `fromYear`/`toYear` en el Calendar)
- Prop `value` (string `yyyy-MM-dd`) y `onChange` (string)
- Validacion basica del formato al salir del campo (blur)

#### B. Nuevo componente reutilizable: `PhoneInput`

Crear `src/components/ui/phone-input.tsx` que combine:
- Un `Select` compacto a la izquierda con los codigos de pais mas comunes (bandera emoji + codigo)
- Un `Input` a la derecha para el numero
- Props: `value` (string completo con codigo), `onChange`
- Codigos incluidos: CO (+57), MX (+52), AR (+54), CL (+56), PE (+51), EC (+593), VE (+58), US (+1), ES (+34), BR (+55), PA (+507), CR (+506), DO (+1-809), GT (+502), HN (+504), SV (+503), NI (+505), UY (+598), BO (+591), PY (+595)

#### C. Archivos a modificar (reemplazo de date pickers)

| Archivo | Cambio |
|---|---|
| `src/components/ui/date-input.tsx` | **NUEVO** - Componente DateInput reutilizable |
| `src/components/ui/phone-input.tsx` | **NUEVO** - Componente PhoneInput con selector de pais |
| `src/pages/creadores/onboarding/steps/Step1PersonalInfo.tsx` | Reemplazar `Popover+Calendar` de fecha de nacimiento por `DateInput`; reemplazar `Input tel` por `PhoneInput` |
| `src/pages/creadores/NuevoCreadorForm.tsx` | Reemplazar `Input type="date"` en fecha de nacimiento (linea 330) y fecha de inicio (linea 419) por `DateInput`; reemplazar input telefono (linea 368) por `PhoneInput` |
| `src/pages/creadores/InfoTabContent.tsx` | Reemplazar `Input type="date"` (linea 274) por `DateInput` |
| `src/pages/hr/EmployeeNew.tsx` | Reemplazar `Popover+Calendar` de fecha nacimiento (lineas 228-238) por `DateInput`; reemplazar inputs de telefono (lineas 220, 224, 261) por `PhoneInput` |
| `src/pages/hr/HRTraining.tsx` | Reemplazar `Input type="date"` (linea 156) por `DateInput` |
| `src/pages/hr/HRPerformance.tsx` | Reemplazar `Input type="date"` (linea 169) por `DateInput` |
| `src/pages/hr/HRIncidents.tsx` | Reemplazar `Input type="date"` (linea 169) por `DateInput` |
| `src/pages/eventos/EditEventoModal.tsx` | Reemplazar `Input type="date"` en fecha inicio (linea 130) y fecha fin (linea 134) por `DateInput` |

### Detalle tecnico del DateInput

```text
Props:
- value: string (formato yyyy-MM-dd)
- onChange: (value: string) => void
- placeholder?: string (default "dd/mm/aaaa")
- disabled?: boolean
- className?: string
- fromYear?: number (default 1940)
- toYear?: number (default current year + 5)

Layout:
[  dd/mm/aaaa  ] [icono calendario]
                      |
                 Popover con Calendar
                 (captionLayout="dropdown-buttons")
```

El Calendar usara `captionLayout="dropdown-buttons"` con `fromYear` y `toYear` para permitir seleccionar ano y mes rapidamente desde dropdowns en lugar de navegar mes a mes.

### Detalle tecnico del PhoneInput

```text
Props:
- value: string (ej: "+57 3001234567")
- onChange: (value: string) => void
- placeholder?: string
- className?: string

Layout:
[CO +57 v] [  3001234567  ]
```

El componente parsea el value para separar codigo de pais y numero local, y los recombina en onChange.

