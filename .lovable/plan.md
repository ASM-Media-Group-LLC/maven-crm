

## Plan: Arreglar selectores de empleados en RRHH

### Problema raíz

El componente `EmployeeSearchCombobox` usa `cmdk` v1.x pero **no envuelve el `CommandGroup` dentro de `CommandList`**. En cmdk v1, los items deben estar dentro de `CommandList` para que funcione la selección y el filtrado. Sin esto, hacer clic en un item no dispara `onSelect`.

### Archivos a modificar

**1. `src/components/hr/EmployeeSearchCombobox.tsx`**

Envolver `CommandEmpty` y `CommandGroup` dentro de `<CommandList>`:

```tsx
<Command>
  <CommandInput placeholder="Buscar empleado..." />
  <CommandList>           {/* ← AGREGAR */}
    <CommandEmpty>No se encontró ningún empleado.</CommandEmpty>
    <CommandGroup className="max-h-60 overflow-y-auto">
      ...items...
    </CommandGroup>
  </CommandList>          {/* ← AGREGAR */}
</Command>
```

Agregar `CommandList` al import desde `@/components/ui/command`.

Este único cambio arregla todos los selectores de empleados en: Incidentes, Deducciones, Desempeño, Capacitación, Horas Extra, Banco de Horas, Ausencias, Permisos y Vacaciones (12 archivos usan este componente).

Los selectores de Onboarding y Offboarding usan `<Select>` de Radix directamente (no el combobox), por lo que no deberían tener este problema. Si reportas que esos también fallan, sería un tema diferente.

