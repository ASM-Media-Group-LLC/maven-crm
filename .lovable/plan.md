

# Ajustar Header y Footer Fijos en Nuevo Creador

## Problema

El formulario de `/creadores/nuevo` usa `<main className="flex-1 overflow-auto p-6">` donde todo el contenido (incluyendo header) hace scroll. El footer usa `fixed bottom-0` que se superpone al sidebar. Esto no coincide con el patron de `/eventos/nuevo` que tiene header y footer fijos con el contenido central scrollable.

## Solucion

Aplicar el mismo patron de `NuevoEventoForm`: cambiar el `<main>` a `flex-1 flex flex-col h-full overflow-hidden`, extraer el header a un `<header>` sticky con `border-b`, mover el contenido a un `<div className="flex-1 overflow-auto p-6">`, y cambiar el footer de `fixed` a un `<footer>` integrado en el flex con `shrink-0`. Cambiar el texto "Guardar" a "Agregar creador".

## Cambios en `src/pages/creadores/NuevoCreadorForm.tsx`

### 1. Cambiar el contenedor `<main>` (linea 277)

De:
```
<main className="flex-1 overflow-auto p-6 min-w-0">
```
A:
```
<main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
```

### 2. Extraer header fijo (lineas 278-297)

Sacar el header del div scrollable y envolverlo en un `<header>` con estilos sticky:
```
<header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
  <div className="flex items-center justify-between">
    <button ...>Volver a Creadores</button>
    <Button ...>Llenar datos de prueba</Button>
  </div>
  <h1>Nuevo Creador</h1>
  <p>Completa los detalles del nuevo creador</p>
</header>
```

### 3. Contenido scrollable (a partir de la Seccion 1)

Envolver las 9 secciones del formulario en:
```
<div className="flex-1 overflow-auto p-6">
  <div className="space-y-6">
    <!-- Secciones 1-9 sin cambios -->
  </div>
</div>
```

Eliminar el `pb-24` que ya no es necesario (el footer ya no es `fixed`).

### 4. Footer integrado en flex (lineas 576-583)

De:
```
<div className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background/95 backdrop-blur-sm px-6 py-3">
  <div className="max-w-6xl mx-auto flex justify-end gap-3">
    <Button variant="outline">Cancelar</Button>
    <Button><Save /> Guardar</Button>
  </div>
</div>
```
A:
```
<footer className="bg-background border-t border-border px-6 py-4 flex justify-end gap-3 shrink-0">
  <Button variant="outline">Cancelar</Button>
  <Button>Agregar creador</Button>
</footer>
```

Cambios en el boton:
- Texto de "Guardar" a "Agregar creador"
- Estado loading de "Guardando..." a "Agregando..."
- Eliminar el icono `<Save>` para coincidir con el patron de NuevoEventoForm
- Eliminar `max-w-6xl mx-auto` del footer

