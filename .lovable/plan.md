

# Corregir Consistencia de Margenes y Padding en Todo el Layout

## Problema

Las paginas de listado (`/eventos`, `/creadores`) usan el patron correcto: `<main className="flex-1 overflow-auto p-6 space-y-6 min-w-0">` donde el contenido se extiende al ancho completo del area disponible.

Sin embargo, las paginas de formulario aplican `max-w-6xl mx-auto` que centra y restringe el contenido, creando margenes laterales excesivos que no coinciden con las paginas de listado.

## Causa raiz

- **NuevoEventoForm.tsx** (linea 141): `<div className="max-w-6xl mx-auto">` dentro del area scrollable
- **NuevoCreadorForm.tsx** (linea 278): `<div className="max-w-6xl mx-auto pb-24 space-y-6">` como contenedor principal

## Solucion

Eliminar `max-w-6xl mx-auto` de ambos formularios para que el contenido se extienda al ancho completo con solo el padding `p-6` como borde lateral, igual que en `/eventos` y `/creadores`.

## Cambios por archivo

### 1. `src/pages/eventos/NuevoEventoForm.tsx` (linea 141)

Cambiar:
```
<div className="max-w-6xl mx-auto">
```
Por:
```
<div>
```

### 2. `src/pages/creadores/NuevoCreadorForm.tsx` (linea 278)

Cambiar:
```
<div className="max-w-6xl mx-auto pb-24 space-y-6">
```
Por:
```
<div className="pb-24 space-y-6">
```

Esto mantiene el `pb-24` (padding inferior para el boton flotante) y `space-y-6` (espaciado entre secciones) pero elimina la restriccion de ancho y el centrado.

## Patron estandar resultante

Todas las paginas usaran el mismo esquema:
- Contenedor `<main>` con `p-6` proporciona 1.5rem de padding lateral uniforme
- El contenido interno no tiene restriccion de ancho adicional
- Los bordes laterales coinciden visualmente en todas las vistas
