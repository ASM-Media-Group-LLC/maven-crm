

## Vista "Ver Agentes" en Promolog

### Resumen
Al hacer clic en "Ver Agentes", la pagina cambia para mostrar una seccion de "Desempeno por Agente" en lugar de la seccion de redes sociales. El boton cambia su texto a "Ver Dashboard" para volver a la vista original.

### Cambios en `src/pages/promolog/PromologContent.tsx`

**1. Nuevo estado para controlar la vista:**
- Agregar `useState<"dashboard" | "agentes">` inicializado en `"dashboard"`

**2. Cambio en el boton "Ver Agentes":**
- Cuando la vista es `"dashboard"`: muestra "Ver Agentes" con `variant="outline"`
- Cuando la vista es `"agentes"`: muestra "Ver Dashboard" con estilo primario (sin variant, fondo primary) -- el boton actua como toggle

**3. Datos mock de agentes:**
- Array estatico con la informacion del agente visible en la imagen:
  - `lorena_lozano`: 5 tickets ingresados, Si: 5 (verde), Parcial: 0 (amarillo), No: 0 (rojo), badges: IG 3, X 2

**4. Seccion "Desempeno por Agente" (reemplaza la seccion Social cuando vista es "agentes"):**
- Titulo: "Desempeno por Agente" (text-lg font-semibold)
- Subtitulo: "Mostrando 1 agente con actividad entre 13 feb - 13 feb 2026" (dinamico segun fecha seleccionada)
- Card con cada agente mostrando:
  - Icono de usuario (avatar circular con icono Users)
  - Nombre en negrita: "lorena_lozano"
  - Subtexto: "5 tickets ingresados"
  - Indicadores de estado a la derecha:
    - Circulo verde + numero (Si)
    - Circulo amarillo + numero (Parcial)
    - Circulo rojo + numero (No)
  - Separador vertical
  - Badges: "IG 3" y "X 2" con estilo outline

**5. Renderizado condicional:**
- Si `view === "dashboard"`: muestra la seccion de redes sociales (actual)
- Si `view === "agentes"`: muestra la seccion de Desempeno por Agente
- Las tarjetas KPI se mantienen visibles en ambas vistas

### Estructura visual de la fila de agente
```text
[ Avatar ]  lorena_lozano          [check]5  [minus]0  [x]0  |  [IG 3]  [X 2]
            5 tickets ingresados     Si      Parcial    No
```

