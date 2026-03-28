

## Diagnóstico y Plan: Problemas de Caché y Despliegue en Maven

### Diagnóstico

**Causa raíz identificada: El Service Worker (PWA) está cacheando agresivamente todo, incluyendo `index.html`.**

La configuración actual de `vite-plugin-pwa` tiene `globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"]` — esto precachea el `index.html` en el service worker. Aunque `skipWaiting` y `clientsClaim` están activos, el navegador puede seguir sirviendo la versión cacheada del HTML hasta que el SW se actualice, lo cual no es instantáneo. Esto es la causa principal de que los usuarios vean versiones antiguas.

**Sobre cache-busting de JS/CSS:** Vite ya genera hashes en los nombres de archivo por defecto (ej: `assets/index-a1b2c3.js`). Esto no requiere cambios.

### Resumen de últimos 3 cambios importantes
1. Sincronización del Invoice (persistir `agency_amount`, `blue_amount`, `paypal_amount` en DB y actualizar `InvoiceA4Preview.tsx`)
2. Desglose en preview A4 (Agency Services + Blue + PayPal con cálculos dinámicos)
3. Corrección del botón duplicado en `ForgotPassword.tsx`

---

### Cambios a implementar

#### 1. `index.html` — Headers anti-caché
Agregar meta tags de control de caché en el `<head>`:
```html
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
<meta http-equiv="Pragma" content="no-cache" />
<meta http-equiv="Expires" content="0" />
```

#### 2. `vite.config.ts` — Excluir HTML del precache del SW
Cambiar `globPatterns` para excluir `html`:
```
globPatterns: ["**/*.{js,css,ico,png,svg,woff2}"]
```
Agregar `navigateFallback: undefined` explícitamente para evitar que el SW intercepte la navegación con un HTML cacheado.

Agregar runtime caching para el HTML con `NetworkFirst`:
```ts
{
  urlPattern: /\/$/,
  handler: "NetworkFirst",
  options: {
    cacheName: "html-cache",
    expiration: { maxEntries: 10, maxAgeSeconds: 300 },
  },
}
```

#### 3. Despliegue limpio
Después de aplicar estos cambios, el usuario deberá hacer **Publish → Update** desde Lovable para forzar un despliegue limpio. Los usuarios existentes recibirán el nuevo SW que dejará de servir HTML obsoleto.

### Archivos a modificar
- `index.html` (meta tags anti-caché)
- `vite.config.ts` (ajustar PWA/workbox config)

