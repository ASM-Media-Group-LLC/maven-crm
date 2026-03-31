

## Plan: Insertar 6 creadoras faltantes del CSV anterior

### Hallazgos

Del CSV del Maven anterior, las 7 creadoras que mencionaste están **todas en el CSV** con datos completos. Comparando contra la DB actual:

- **6 no existen**: PaulydelanyVIP, TheAlediazvip, Exclusive_laura, Julirodriguezok, EsmeraldaModel, SweetGirl4
- **1 ya existe**: AgathaVipOnly — ya está como "Agatha Gomez Casiano" con handle `Agathainsta` (ID `0bc0fe9a`). En el CSV hay **dos** registros de Agatha (uno con `Agathainsta` y otro nuevo `4b594060` sin handle, categoría B+). No se insertará duplicado.

### Datos a insertar (6 registros)

| Nombre | Artístico | Instagram | OF URL | Status | Cat | País | Ciudad | Phone | Email |
|--------|-----------|-----------|--------|--------|-----|------|--------|-------|-------|
| Vicente Paul McDonald | — | delanyprecilla | — | active | A+ | EEUU | Miami | — | paul09mcdonald@gmail.com |
| Alejandra Frnciasca Díaz Palestini | TheAlediazvip | alediazpalestini | — | active | A+ | Chile | Santiago | — | — |
| Gleivimar Carolina Valero González | Exclusive_laura | laura_cookie02 | — | active | A+ | Colombia | Medellín | 3207612680 | — |
| Julieta Rodriguez | JulietaRodriguezok | julietarodriguezok | — | active | A+ | México | CDMX | +5215667767611 | — |
| Esmeralda Arango Sánchez | — | esmeralda_arang0 | — | active | B+ | Colombia | Medellín | +573242761716 | Esmeraldaarango635@gmail.com |
| Katty Juliet Roldán Correa | SweetGirl4 | kattyroldan04 | — | active | B+ | Colombia | Medellín | — | — |

### Implementación

Usar la herramienta de inserción de datos para ejecutar 6 `INSERT INTO creators (...)` con los datos del CSV, preservando los UUIDs originales para mantener consistencia con el sistema anterior. Se incluirán también `assigned_agency`, `kash_type`, `birth_date`, y `languages` tal como aparecen en el CSV.

### Nota sobre Agatha

El segundo registro de Agatha (ID `4b594060`, categoría B+, sin handle) parece ser una versión actualizada. Ya existe un registro activo con handle `Agathainsta`. Se puede actualizar el existente para agregar el teléfono (+17874133008) y email (Management.agatha@gmail.com) si no los tiene, pero no se creará duplicado.

