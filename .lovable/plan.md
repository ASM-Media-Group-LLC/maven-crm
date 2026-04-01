

## Fix: Mostrar "Agregar Contacto" para closers en /leadgen

### Problema
El botón "Agregar Contacto" está condicionado a `viewMode !== "agent"`. El rol **closer** tiene `data_scope: "self"` en LeadGen, lo que resulta en `viewMode = "agent"`, ocultando el botón.

### Causa raíz
La condición `viewMode !== "agent"` fue diseñada para ocultar el botón solo a agentes de LeadGen, pero afecta también a closers que necesitan agregar contactos.

### Solución
Cambiar la condición para que el botón "Agregar Contacto" sea visible siempre, independientemente del `viewMode`. Los closers necesitan esta funcionalidad para alimentar su pipeline.

### Cambio

**Archivo**: `src/pages/leadgen/LeadGenContent.tsx` (línea ~229)

Eliminar la condición `viewMode !== "agent"` del wrapper del botón, dejándolo siempre visible:

```tsx
// Antes
{viewMode !== "agent" && (
  <Button variant="outline" size="sm" onClick={() => setAddContactoOpen(true)}>
    <UserPlus className="h-4 w-4" />
    Agregar Contacto
  </Button>
)}

// Después
<Button variant="outline" size="sm" onClick={() => setAddContactoOpen(true)}>
  <UserPlus className="h-4 w-4" />
  Agregar Contacto
</Button>
```

### Alternativa (si solo closers deben verlo)
Si prefieres que agentes LeadGen NO vean el botón pero closers sí, necesitaríamos distinguir el rol real del usuario. Pero dado que los agentes LeadGen también podrían necesitar agregar contactos, la solución más simple es mostrar el botón siempre.

