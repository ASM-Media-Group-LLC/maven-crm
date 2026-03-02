

## Plan: Igualar altura de cards y eliminar línea conectora

### Problemas identificados
1. Las cards tienen alturas diferentes porque el texto de descripción varía en longitud
2. La línea conectora horizontal que cruza por el medio de las cards se ve mal

### Cambios en `src/pages/landing/LandingHowItWorks.tsx`

1. **Eliminar el componente `ConnectorLine`** completo y su uso en el grid
2. **Forzar altura igual en las cards** agregando `h-full` al div de la card para que cada una ocupe el 100% de su celda del grid, y asegurar que el `ScrollReveal` wrapper también use `h-full` via className

