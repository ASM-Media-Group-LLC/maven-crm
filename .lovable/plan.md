

## Fix: Error de `virtual:pwa-register` en desarrollo

### Causa
En `src/main.tsx`, el `import("virtual:pwa-register")` se ejecuta en runtime pero Vite intenta resolver la referencia en tiempo de transformación incluso en desarrollo. Como `VitePWA` solo se activa en `mode === "production"`, el módulo virtual no existe y Vite lanza error.

### Solución
Envolver el bloque completo del import en una guarda de `import.meta.env.PROD` para que Vite haga tree-shaking y ni siquiera intente resolver el import en desarrollo:

**Archivo: `src/main.tsx`**
- Cambiar la condición `isProductionHost && import.meta.env.PROD` a que el `import.meta.env.PROD` sea la guarda **exterior** (primera condición del `if`), y `isProductionHost` sea la segunda
- Esto es porque Vite solo elimina el import muerto si `import.meta.env.PROD` es la condición directa del bloque, no anidada con `&&`

Alternativa más robusta: mover todo el bloque PWA a un archivo separado (ej. `src/pwa.ts`) y hacer el import condicional desde `main.tsx`:

```typescript
if (import.meta.env.PROD) {
  import("./pwa");
}
```

Y en `src/pwa.ts` poner toda la lógica de registro del service worker. Así Vite descarta el archivo completo en dev.

### Archivos a modificar
1. `src/main.tsx` — extraer lógica PWA
2. `src/pwa.ts` — nuevo archivo con el registro del SW (solo se importa en PROD)

