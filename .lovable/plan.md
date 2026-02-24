

## Alinear "Fecha de nacimiento" con "País"

### Problema

Actualmente el orden de campos es: Telefono | Edad | Fecha de nacimiento | Pais. Esto coloca "Fecha de nacimiento" y "Pais" en la misma fila, pero visualmente pueden verse desalineados por diferencias de altura entre el `DateInput` y el `Select`.

### Solucion

Reorganizar el orden para que "Edad" y "Fecha de nacimiento" queden juntos en una fila, y "Pais" y "Ciudad" queden juntos en la siguiente fila. Esto agrupa los campos por contexto logico y resuelve la desalineacion visual.

Orden resultante:
```text
Telefono        | Edad
Fecha nacimiento | Pais  (misma fila, alineados)
Ciudad          | Zona horaria
```

### Archivo a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/creadores/onboarding/steps/Step1PersonalInfo.tsx` | Mover el campo "Fecha de nacimiento" para que quede en la misma fila que "Pais", reordenando Edad antes de Fecha |

El cambio es minimo: solo se reordena la posicion del bloque de "Fecha de nacimiento" (lineas 157-160) para que quede inmediatamente antes del bloque de "Pais" (lineas 161-169), manteniendo ambos en la misma fila del grid de 2 columnas.
