

# Plan: Simplificar barra de navegación en /tareas

## Problema
El botón "Proyectos" en el toggle es redundante — la vista de proyectos ES la vista base. Solo necesitamos el toggle Grid/List (para la vista de proyectos) y Analíticas. Además, la barra de filtros y KPIs debe permanecer fija (sticky) al hacer scroll.

## Cambios en `ProjectsListContent.tsx`

1. **Eliminar botón "Proyectos"** del toggle group. Reemplazar la lógica: `mainView` pasa de `"projects" | "analytics"` a solo un booleano o toggle donde "Analíticas" se activa/desactiva, y Grid/List siempre están visibles.

2. **Reorganizar el toggle**: Quedan solo 3 botones en el grupo — Lista, Grid, Analíticas — con un separador visual antes de Analíticas. Al clickear Analíticas se muestra esa vista; al clickear Lista o Grid se vuelve a la vista de proyectos con ese modo.

3. **Hacer sticky la barra**: Mover KPIs + filtros a un contenedor con `sticky top-0 z-10 bg-background` para que permanezcan fijos al scrollear el contenido.

## Resultado visual (como la imagen de referencia)
```text
[🔍 Buscar proyecto...] [Carpeta ▾] [Estado ▾]     [📊 Analíticas] [≡] [⊞]
```

## Archivo modificado
| Archivo | Cambio |
|---------|--------|
| `ProjectsListContent.tsx` | Eliminar tab "Proyectos", reorganizar toggle, hacer sticky KPIs+filtros |

