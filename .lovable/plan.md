

## Restaurar Tabs de Agencia en Onboarding

### Archivo a modificar

**`src/pages/creadores/onboarding/OnboardingContent.tsx`**

### Cambios

#### 1. Agregar fila de tabs de agencia entre las KPI cards y la barra de filtros

Insertar justo despues del grid de KPI cards (linea 126) y antes de la seccion wizard/list (linea 128), una fila de botones tipo pill siguiendo el patron estandar de la plataforma (`inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1`):

```text
<div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
  <Button size="sm" variant={activeTab === "Todas" ? "secondary" : "ghost"}
    onClick={() => setActiveTab("Todas")}>Todas</Button>
  <Button size="sm" variant={activeTab === "Atomic Agency" ? "secondary" : "ghost"}
    onClick={() => setActiveTab("Atomic Agency")}>Atomic Agency</Button>
  <Button size="sm" variant={activeTab === "Elite Models" ? "secondary" : "ghost"}
    onClick={() => setActiveTab("Elite Models")}>Elite Models</Button>
  ... (Kash Agency, Unlok Platform, Trafix, Otra)
</div>
```

Se usara el array `agencyOptions` ya definido en linea 15 para generar los botones dinamicamente, con "Todas" como primer boton fijo.

#### 2. Eliminar el dropdown de Agencia de la barra de filtros

Remover el bloque `Select` de agencias (lineas 150-160) de la barra de filtros unificada, ya que la funcion de filtrado por agencia pasa a los tabs. Esto evita duplicidad.

#### 3. Sin cambios en la logica de filtrado

La variable `activeTab` y su uso en el `useMemo` de `filtered` (lineas 32-34) ya funcionan correctamente. `hasActiveFilters` y `clearFilters` ya contemplan `activeTab`. No se requiere ningun cambio logico.

### Resultado visual

```text
[Header: Onboarding + Boton "Iniciar Onboarding"]
[KPI: Total | Pendientes | En Progreso | Completados]     <-- filtros maestros
[Todas | Atomic Agency | Elite Models | Kash | Unlok | Trafix | Otra]  <-- tabs restaurados
[Buscar... | Etapa del Proceso v | Limpiar filtros | [Lista|Grid]]
[Tabla o Grid de resultados]
```

