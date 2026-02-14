

## Rediseño completo del Auth: gradiente animado fluido + glass card centrada

### 1. Rediseño del layout

Cambiar de layout split (50/50) a layout full-screen donde el gradiente animado ocupa toda la pantalla y el formulario se centra sobre una card con efecto glassmorphism. El logo se coloca arriba de la card, centrado.

### 2. Mejorar animacion del gradiente

Reescribir los keyframes para que los blobs tengan trayectorias mas complejas y organicas, moviendose en multiples direcciones, uniendose y separandose. Usar duraciones mas largas (18-25s) y movimientos mas amplios para un efecto fluido y cinematografico.

### 3. Glass card para el formulario

El formulario se envuelve en una card con efecto glass:
- `backdrop-blur-xl` para el desenfoque del fondo
- `bg-white/5` (dark) o `bg-black/5` (light) para transparencia sutil
- `border border-white/10` para borde translucido
- `shadow-2xl` para profundidad

### Cambios por archivo

| Archivo | Cambio |
|---------|--------|
| `src/components/auth/AuthLayout.tsx` | Redisenar a full-screen con gradiente de fondo completo, logo centrado arriba, y children dentro de glass card centrada |
| `src/components/auth/AnimatedGradientBackground.tsx` | Ajustar blobs para cubrir toda la pantalla (no solo panel izquierdo). Mas grandes, mas movimiento |
| `src/index.css` | Reescribir keyframes blob-move-1 a blob-move-4 con trayectorias mas complejas y largas |
| `src/pages/Login.tsx` | Eliminar wrapper div y pasar contenido directo (titulo, form, links). Quitar la card border/bg-card del form ya que AuthLayout provee la glass card |
| `src/pages/Register.tsx` | Mismo ajuste que Login |
| `src/pages/ForgotPassword.tsx` | Mismo ajuste |
| `src/pages/ResetPassword.tsx` | Mismo ajuste |

### Detalle tecnico

**AuthLayout.tsx** - Nueva estructura:
```text
<div class="min-h-screen relative overflow-hidden bg-[hsl(240,8%,6%)]">
  <AnimatedGradientBackground />
  <div class="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-8">
    <Logo size="md" class="mb-8" />
    <div class="glass-card w-full max-w-md backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl">
      {children}
    </div>
  </div>
</div>
```

**AnimatedGradientBackground.tsx** - Ajustes:
- Blobs mas grandes (70-80% de viewport)
- Posiciones distribuidas por toda la pantalla
- Opacidades entre 0.3 y 0.5
- Un quinto blob opcional para mas dinamismo

**Keyframes mejorados** (index.css):
- `blob-move-1`: trayectoria diagonal amplia, 20s
- `blob-move-2`: movimiento circular inverso, 25s
- `blob-move-3`: desplazamiento vertical pronunciado, 18s
- `blob-move-4`: zigzag horizontal, 22s

Cada keyframe usara multiples puntos intermedios (0%, 33%, 66%, 100%) en vez de solo 0%/100% para crear trayectorias curvas y mas organicas.

**Login.tsx / Register.tsx / ForgotPassword.tsx / ResetPassword.tsx**:
- Eliminar el div wrapper `max-w-md space-y-8` (ya lo provee AuthLayout)
- Quitar `rounded-lg border border-border bg-card p-6` del form (la glass card ya provee el contenedor)
- Mantener el form con `space-y-5` pero sin borde/fondo propio
- Los links de navegacion van debajo del form, dentro de la glass card
- El logo mobile (`lg:hidden`) ya no es necesario porque el logo siempre es visible

