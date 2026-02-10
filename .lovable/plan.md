

# Actualizar items de "Operacion Core" en categoriesConfig.ts

## Resumen

Agregar 5 nuevos items al inicio de la categoria "Operacion Core" antes de los existentes (Estrategia PPV y Contenido Custom).

## Cambios

### Archivo: `src/pages/creadores/lineamientos/categoriesConfig.ts`

Agregar estos items al inicio del array `items` de "Operacion Core":

1. **Precios** - "Lista de precios por tipo de contenido o servicio" - icono: `DollarSign`
2. **Limites** - "Contenido o acciones NO permitidas" - icono: `AlertCircle`
3. **Gustos y Preferencias** - "Lo que le gusta y prefiere la creadora" - icono: `Crown`
4. **Estilo de Contenido** - "Tipos de contenido y estilo visual" - icono: `Palette`
5. **Reglas de Sexting** - "Lineamientos para conversaciones intimas" - icono: `MessageSquare`

Los items existentes (Estrategia PPV y Contenido Custom) se mantienen despues de estos 5 nuevos. Se reutilizan iconos ya importados en el archivo, sin necesidad de agregar nuevas dependencias.

