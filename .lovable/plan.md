

## Verificacion de Flujos y Navegacion en Onboarding

### Resultado del analisis

Se revisaron los 4 componentes principales del modulo:
- `OnboardingContent.tsx` -- contenedor principal con KPIs, cards en curso, tabla/grid
- `OnboardingWizard.tsx` -- wizard inline de 4 pasos
- `OnboardingTable.tsx` -- tabla de creadores
- `OnboardingGrid.tsx` -- grid de creadores

**Navegacion**: No hay problemas de redireccion. El wizard se abre inline mediante estado local (`showWizard`), no mediante cambio de ruta. La tabla y el grid no tienen handlers de clic ni enlaces que redireccionen fuera de `/creadores/onboarding`. El boton "Continuar" en las cards de "Onboardings en Curso" tambien opera sobre estado local.

**Unico problema encontrado**: El orden de las pestanas de agencia no sigue el orden canonico del sistema.

### Cambio a realizar

**Archivo**: `src/pages/creadores/onboarding/OnboardingContent.tsx`

Corregir el array `areaTabs` (linea 18) para que siga el orden canonico estandarizado:

```text
Antes:  ["Todas", "Atomic Agency", "Elite Models", "Kash Agency", "Trafix", "Unlok Platform", "Otra"]
Despues: ["Todas", "Atomic Agency", "Elite Models", "Kash Agency", "Unlok Platform", "Trafix", "Otra"]
```

El cambio es una transposicion de "Trafix" y "Unlok Platform" para respetar la jerarquia oficial: Atomic, Elite, Kash, Unlok, Trafix, Otra (siempre al final).

### Verificacion confirmada

| Flujo | Estado |
|---|---|
| Clic en fila de tabla | Sin handler, no navega -- OK |
| Clic en card de grid | Sin handler, no navega -- OK |
| Boton "Continuar" en card | Abre wizard inline -- OK |
| Boton "Volver a la lista" en wizard | Cierra wizard, muestra lista -- OK |
| Breadcrumb "Creadores" | Navega a /creadores -- OK |
| Filtros por agencia | Funcionan correctamente, solo falta corregir orden -- Fix |

