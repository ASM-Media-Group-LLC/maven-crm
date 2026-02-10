

# Agregar banner azul de fondo detras del hero card del perfil

## Objetivo

Agregar una franja/banner de color azul (similar al color primary del sistema) que aparezca detras de la tarjeta hero del perfil del creador, tal como se ve en la imagen de referencia. El banner azul se extiende horizontalmente y queda parcialmente cubierto por la tarjeta del perfil, creando un efecto de profundidad visual.

## Cambio

**Archivo:** `src/pages/creadores/CreadorProfileContent.tsx`

Se agregara un div decorativo con fondo azul (usando `bg-primary` o `bg-primary/80`) justo antes de la tarjeta hero existente, con margen negativo inferior para que la tarjeta se superponga parcialmente sobre el banner.

Estructura actual:
```text
<main>
  <div> (boton Volver) </div>
  <div> (tarjeta hero con gradiente) </div>
  <div> (tabs) </div>
</main>
```

Estructura propuesta:
```text
<main>
  <div> (boton Volver) </div>
  <div class="bg-primary h-32 mx-6 rounded-xl -mb-16"> (banner azul decorativo) </div>
  <div class="relative z-10"> (tarjeta hero existente, sin cambios internos) </div>
  <div> (tabs) </div>
</main>
```

Detalles:
- El banner azul tendra altura fija (~8rem / h-32), bordes redondeados (`rounded-xl`), y margen horizontal (`mx-6`) para alinearse con la tarjeta
- Se usara `-mb-16` (margen inferior negativo) en el banner para que la tarjeta hero se superponga sobre el
- Se agregara `relative z-10` a la tarjeta hero existente para que quede por encima del banner
- No se modificara ningun contenido, funcionalidad ni estilos internos de la tarjeta hero
- El color sera `bg-primary` que usa la variable CSS del sistema de diseno

## Seccion tecnica

| Archivo | Lineas aprox. | Cambio |
|---|---|---|
| `CreadorProfileContent.tsx` | ~100-103 | Insertar div decorativo antes de la tarjeta hero y agregar `relative z-10` a la tarjeta |

