

## Rediseno moderno de Login, Registro, Forgot Password y Reset Password

### Concepto visual

Layout de dos columnas (split-screen) inspirado en la referencia:
- **Lado izquierdo (50%)**: Panel decorativo con fondo de gradiente oscuro (accent/primary), particulas/estrellas animadas via CSS, y el logo Maven grande centrado
- **Lado derecho (50%)**: Fondo limpio (`bg-background`) con la card del formulario centrada
- **En movil**: Solo se muestra el lado derecho (formulario) a pantalla completa

### Detalle tecnico

#### Componente compartido: `AuthLayout.tsx`

Crear un layout reutilizable para las 4 paginas de auth:

```text
src/components/auth/AuthLayout.tsx

Props:
  - children: ReactNode (el formulario)

Estructura:
  <div className="flex min-h-screen">
    {/* Panel izquierdo - decorativo */}
    <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-[hsl(var(--accent))] via-[hsl(240,8%,15%)] to-[hsl(var(--primary)/0.3)]">
      {/* Particulas/estrellas animadas via CSS */}
      <ParticlesBackground />
      {/* Logo centrado */}
      <div className="relative z-10 flex flex-col items-center justify-center w-full">
        <Logo size="lg" />
        <p className="text-white/60 mt-4 text-lg">Gestiona tus creadores</p>
      </div>
    </div>
    {/* Panel derecho - formulario */}
    <div className="w-full lg:w-1/2 flex items-center justify-center px-4 py-8">
      {children}
    </div>
  </div>
```

#### Componente: `ParticlesBackground.tsx`

Particulas/estrellas animadas usando CSS puro (sin librerias externas):

```text
src/components/auth/ParticlesBackground.tsx

- 20-30 elementos <div> pequenos (2-4px) con posicion absoluta aleatoria
- Color blanco con opacidad variable (0.2 a 0.6)
- Animacion CSS "twinkle" que alterna opacidad
- Algunos elementos mas grandes (6-8px) con blur para efecto bokeh
- Todo generado con un array y estilos inline para posiciones aleatorias
```

Keyframes a agregar en `index.css`:

```text
@keyframes twinkle {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 0.8; }
}
@keyframes float-particle {
  0%, 100% { transform: translateY(0) translateX(0); }
  50% { transform: translateY(-20px) translateX(10px); }
}
```

#### Cambios en las 4 paginas de auth

Cada pagina se simplifica: eliminar el wrapper `min-h-screen items-center justify-center` y envolver el contenido con `<AuthLayout>`. El formulario mantiene la misma logica y campos.

| Archivo | Cambio |
|---------|--------|
| `src/components/auth/AuthLayout.tsx` | Nuevo - layout split-screen reutilizable |
| `src/components/auth/ParticlesBackground.tsx` | Nuevo - particulas CSS animadas |
| `src/pages/Login.tsx` | Envolver con AuthLayout, quitar wrapper externo |
| `src/pages/Register.tsx` | Envolver con AuthLayout, quitar wrapper externo |
| `src/pages/ForgotPassword.tsx` | Envolver con AuthLayout, quitar wrapper externo |
| `src/pages/ResetPassword.tsx` | Envolver con AuthLayout, quitar wrapper externo |
| `src/index.css` | Agregar keyframes twinkle y float-particle |

### Estructura del formulario dentro de AuthLayout

Cada pagina renderizara solo su bloque de contenido (max-w-md, space-y-8) como children de AuthLayout. Ejemplo para Login:

```text
<AuthLayout>
  <div className="w-full max-w-md space-y-8">
    <div className="flex flex-col items-center gap-4 lg:items-start">
      <Logo size="sm" className="lg:hidden" />  {/* Logo solo en mobile */}
      <h2>Iniciar sesion</h2>
      <p>Ingresa tus credenciales...</p>
    </div>
    <form>...</form>
    <links>...</links>
  </div>
</AuthLayout>
```

### Responsive

- **Desktop (lg+)**: Split 50/50, panel izquierdo visible con gradiente y particulas
- **Tablet/Mobile (<lg)**: Panel izquierdo oculto (`hidden lg:flex`), formulario centrado a pantalla completa con el logo Maven visible arriba del formulario

### Colores utilizados (solo del design system)

- Gradiente del panel: `accent` (purple) -> fondo oscuro -> `primary` (blue) con opacidad
- Particulas: blanco con opacidad (`white/20` a `white/60`)
- Texto decorativo: `white/60`
- Panel derecho: `bg-background` (respeta dark/light mode)
- Cards: sin cambios, mantienen `border-border bg-card`

