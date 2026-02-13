
## Implementar flujo de selección de creadora y apertura del modal de registro de promoción

### Resumen
Cuando el usuario hace clic en una tarjeta de creadora en el modal "Selecciona una Creadora", se debe:
1. Capturar los datos de la creadora seleccionada
2. Cerrar el modal de selección
3. Abrir un nuevo modal de registro de promoción (similar a PromologEntryCard) con los datos de la creadora precargados

### Cambios en `src/pages/promolog/PromologContent.tsx`

**1. Nuevos estados (línea 196)**:
```typescript
const [selectedCreatorForEntry, setSelectedCreatorForEntry] = useState<typeof creators[0] | null>(null);
const [entryModalOpen, setEntryModalOpen] = useState(false);
```

**2. Actualizar el onClick de las tarjetas de creadora en el grid del modal (línea 743)**:

Cambiar de:
```typescript
onClick={() => setCreatorsModalOpen(false)}
```

A:
```typescript
onClick={() => {
  setSelectedCreatorForEntry(creator);
  setEntryModalOpen(true);
  setCreatorsModalOpen(false);
}}
```

**3. Agregar nuevo Dialog modal de registro de promoción (después del Dialog de selección, antes del cierre de `</main>`)**:

Crear un nuevo `<Dialog>` que contenga:
- **DialogHeader**: "Registrar Promoción"
- **Tarjeta de creadora**: Avatar, nombre, handle, redes sociales
- **Selector "¿Promocionó Hoy?"**: Botones Si/No
- **Campos condicionales** (igual al flujo existente en PromologEntryCard):
  - Cuando "Sí": Red Social, Plataforma, Tipo de Contacto, Notas, Evidencia
  - Cuando "No": Ningún campo adicional
- **Botones de acción**: "Cancelar" y "Guardar Entrada"

**4. Estructura técnica del nuevo Dialog**:

```typescript
<Dialog open={entryModalOpen} onOpenChange={setEntryModalOpen}>
  <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
    <DialogHeader className="pr-8">
      <DialogTitle>Registrar Promoción</DialogTitle>
    </DialogHeader>
    
    {/* Creator card */}
    {selectedCreatorForEntry && (
      <>
        <Card className="bg-muted">
          {/* Avatar, nombre, handle, redes sociales */}
        </Card>

        {/* Promoción status */}
        <div className="space-y-2">
          <span className="text-sm font-medium">¿Promocionó Hoy?</span>
          <div className="grid grid-cols-2 gap-3">
            {/* Si/No buttons */}
          </div>
        </div>

        {/* Conditional fields (Si Promocionó) */}
        {/* Red Social, Platform, Contact Type, Notes, Evidence */}

        {/* Footer buttons */}
        <DialogFooter>
          {/* Cancelar y Guardar Entrada */}
        </DialogFooter>
      </>
    )}
  </DialogContent>
</Dialog>
```

**5. Reutilización de lógica**: 

Se pueden reutilizar los mismos estados y lógica de campos que ya existen en `PromologEntryCard.tsx` para mantener consistencia:
- Estados: `editResult`, `editNetwork`, `editPlatform`, `editContactType`, `editNotes`, `editEvidencePreview`
- Opciones: `networkOptions`, `platformOptions`, `contactTypeOptions`
- Funciones helper: `getInitials()`

**6. Integración con base de datos (futura)**:

El botón "Guardar Entrada" debería insertar un nuevo registro en la tabla `promolog_entries` con los campos recolectados, pero por ahora puede mostrar un toast de confirmación.

### Nota técnica

El nuevo modal de registro seguirá el mismo patrón visual y de funcionalidad que el modal de edición en `PromologEntryCard`, pero como nuevo "creador" sin datos previos. Los valores iniciales serán vacíos excepto el nombre y datos del creador.

