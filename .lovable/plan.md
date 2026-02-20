
## Cambios a realizar en `src/pages/hr/HRDashboard.tsx`

### Cambio 1 — Texto del header (líneas 185–186)

Actualizar los textos del encabezado:

| Campo | Actual | Nuevo |
|---|---|---|
| Título `h2` | `Dashboard RRHH` | `Recursos Humanos` |
| Subtítulo `p` | `Vista general de recursos humanos` | `Panel de control del equipo` |

### Cambio 2 — Envolver Quick Actions en un `<Card>`

La sección de Acciones Rápidas actualmente es un `<div>` suelto (líneas 259–293). Se envuelve en un `<Card>` con `<CardHeader>` y `<CardContent>`, exactamente igual al patrón de la sección "Rotación y Retención" (líneas 237–257):

**Antes:**
```tsx
<div>                          {/* div suelto */}
  <div className="flex items-start justify-between mb-3">  {/* header */}
    ...
  </div>
  <div className="grid ...">   {/* cards grid */}
    ...
  </div>
</div>
```

**Después:**
```tsx
<Card>
  <CardHeader className="pb-3">
    <div className="flex items-start justify-between">
      {/* Zap icon + título + subtítulo */}
      {/* Settings2 button */}
    </div>
  </CardHeader>
  <CardContent>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* action cards */}
    </div>
  </CardContent>
</Card>
```

### Archivos a modificar

| Archivo | Líneas afectadas |
|---|---|
| `src/pages/hr/HRDashboard.tsx` | 185–186 (textos del header), 259–293 (estructura Quick Actions) |

No se modifican otros archivos ni otras secciones del dashboard.
