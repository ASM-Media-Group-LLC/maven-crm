

## Plan: Vista default tabla + Mejorar PhoneInput

### Cambios

**1. Cambiar vista default de Contactos a "table" (`ContactosContent.tsx`, línea 78)**
- Cambiar `useState<"table" | "grid">("grid")` → `useState<"table" | "grid">("table")`

**2. Completar códigos de país en `phone-input.tsx`**
La lista actual tiene 20 países (LATAM + US/ES/BR). Faltan varios países relevantes. Se agregarán:
- Cuba (+53), Puerto Rico (+1787), Jamaica (+1876), Trinidad (+1868), Haití (+509), Belice (+501), Guyana (+592), Surinam (+597), Guyana Francesa (+594)
- Canadá (+1), UK (+44), Francia (+33), Alemania (+49), Italia (+39), Portugal (+351), Países Bajos (+31), Rusia (+7), India (+91), China (+86), Japón (+81), Corea del Sur (+82), Australia (+61), Filipinas (+63), Turquía (+90), Egipto (+20), Sudáfrica (+27), Nigeria (+234), Marruecos (+212), Israel (+972), Emiratos (+971), Arabia Saudí (+966)

**3. Reemplazar Select por Popover+Command con buscador (`phone-input.tsx`)**
- Cambiar el `<Select>` actual por un `<Popover>` + `<Command>` (cmdk) que incluya:
  - `<CommandInput>` para buscar por nombre de país, código ISO o prefijo
  - `<CommandList>` con scroll y todos los países
  - `position="popper"` con `side="bottom"` para que siempre se despliegue hacia abajo
- Mantener la misma interfaz externa (`value`, `onChange`, etc.)

### Archivos a modificar
1. `src/pages/contactos/ContactosContent.tsx` — línea 78, default `"table"`
2. `src/components/ui/phone-input.tsx` — lista completa de países + reemplazar Select por Popover+Command con buscador

