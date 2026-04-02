

## Desactivar PWA en modo desarrollo

### Problema
El plugin `vite-plugin-pwa` registra un Service Worker que cachea todos los assets JS/CSS/HTML. En el entorno de preview de Lovable (desarrollo), esto interfiere con Vite HMR y sirve versiones viejas de los módulos, causando que veas una "versión vieja" persistente.

### Solución

**1 archivo a modificar: `vite.config.ts`**

Mover el plugin `VitePWA(...)` dentro de la condición de modo para que solo se active en producción:

```text
Antes:
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({ ... }),
  ]

Después:
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mode === "production" && VitePWA({ ... }),
  ]
```

Esto asegura que:
- En **desarrollo** (preview de Lovable): sin Service Worker, Vite HMR funciona normalmente, siempre ves la versión actual
- En **producción** (app publicada): el PWA sigue funcionando con caché offline

### Detalle técnico
- Cambio de 1 línea en `vite.config.ts` (línea ~19)
- Sin impacto en producción
- Sin cambios en la configuración del PWA

### Acción manual requerida (una vez)
Después del cambio, hacer hard refresh (`Ctrl+Shift+R`) en el preview para desregistrar el SW existente. A partir de ahí no volverá a ocurrir.

