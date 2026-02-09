

# Ajustes en Condiciones Comerciales y Captura y Monetizacion

## Cambios

### 1. Actualizar opciones de Metodo de Pago (linea 36)
Reemplazar el array `PAYMENT_METHODS` con:
`["PayPal", "Crypto", "Zelle", "Pagomundo", "Directa24", "Paxom", "Cuenta Bancaria Colombia", "Cuenta Bancaria Estados Unidos", "Otro"]`

### 2. Actualizar opciones de Plataformas (linea 35)
Reemplazar el array `PLATFORMS` con:
`["Onlyfans", "Unlok", "Fansly", "Patreon", "Otra"]`

### 3. Redisenar "Tiene paquete Blue?" como card con checkbox (lineas 481-484)
Cambiar el checkbox inline por una card igual a la de PickLink, con:
- Titulo bold: "Blue Package"
- Subtitulo muted: "Tiene paquete Blue?"
- Checkbox alineado a la derecha
- Campo condicional: cuando `blue_package` es true, mostrar un input "Monto de Pago" con borde lateral azul (igual patron que PickLink)

Esto requiere agregar un nuevo campo `blue_package_amount: number` al FormData y defaults.

### 4. Alinear boton "Subir Archivos" a la derecha en Captura y Monetizacion (lineas 491-497)
Cambiar el layout del boton de subir archivos para usar `flex justify-between` con el titulo a la izquierda y el boton a la derecha, igual que en la seccion de Documentacion.

## Archivos modificados
- `src/pages/creadores/NuevoCreadorForm.tsx`

## Detalle tecnico

**Nuevo campo FormData:** `blue_package_amount: number` (default 0). Este campo se mapeara a la tabla `creator_business` en el submit (campo por definir o usar `li_payment_amount` existente).

**Card Blue Package (patron igual a PickLink):**
```
<div className="rounded-lg border p-4 flex items-center justify-between">
  <div>
    <p className="text-sm font-medium">Blue Package</p>
    <p className="text-xs text-muted-foreground">Tiene paquete Blue?</p>
  </div>
  <Checkbox ... />
</div>
{form.blue_package && (
  <div className="border-l-2 border-primary pl-4 ml-2">
    <Field label="Monto de Pago">
      <Input type="number" placeholder="1000.00" />
    </Field>
  </div>
)}
```

**Boton subir archivos alineado:**
```
<div className="flex items-center justify-between mb-1">
  <p className="text-sm font-medium">Capturas de Monetizacion</p>
  <Button variant="outline" size="sm" onClick={...}>
    <Upload /> Subir Archivos
  </Button>
</div>
```

