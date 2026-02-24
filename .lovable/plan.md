

## Auto-guardado y Logica de Privacidad para Onboarding de Creadores

### Resumen

Implementar tres mejoras al wizard de onboarding existente: (1) verificar que todos los campos del formulario tengan su columna correspondiente en la tabla `creators`, (2) auto-guardado cada 30 segundos y al cambiar de paso, y (3) logica de privacidad que proteja datos reales cuando los switches estan en OFF.

---

### 1. Migracion de Base de Datos

La tabla `creators` ya tiene columnas para la mayoria de los campos. Sin embargo, muchos datos se almacenan serializados en `internal_notes` como JSON (`extraData`). Para tener columnas dedicadas, se necesita agregar las siguientes columnas:

**Columnas nuevas en `creators`:**

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `segundo_nombre` | text | Segundo nombre |
| `direccion` | text | Direccion completa |
| `timezone` | text | Zona horaria |
| `etnicidad` | text | Etnicidad/nacionalidad |
| `cicatrices` | text | Descripcion de cicatrices |
| `nivel_lectura` | text | Nivel de lectura/escritura |
| `permiso_nombre_real` | boolean | Switch de privacidad: nombre real (default false) |
| `permiso_edad_real` | boolean | Switch de privacidad: edad real (default false) |
| `permiso_ubicacion` | boolean | Switch de privacidad: ubicacion (default false) |
| `edad_mostrar` | integer | Edad artistica a mostrar |
| `ubicacion_artistica` | text | Ubicacion artistica |
| `otras_plataformas` | text | Nombre de otras plataformas |
| `link_otras_plataformas` | text | Links de otras plataformas |
| `helado_favorito` | text | Helado favorito |
| `bebida_favorita` | text | Bebida favorita |
| `musica_artistas` | text | Musica/artistas favoritos |
| `peliculas_tv` | text | Peliculas/TV favoritos |
| `viajes_favoritos` | text | Viajes favoritos |
| `viajes_por_visitar` | text | Viajes pendientes |
| `hermanos` | text | Info sobre hermanos |
| `dia_perfecto` | text | Descripcion dia perfecto |
| `como_eres_cuando_nadie_ve` | text | Personalidad privada |
| `como_quieres_que_te_llamen` | text | Preferencia de trato |
| `respuesta_sexo_en_persona` | text | Script: solicitud encuentro |
| `respuesta_usuario_grosero` | text | Script: usuario grosero |
| `respuesta_pedir_desnudos` | text | Script: pedir material gratis |
| `que_te_incomoda` | text | Lo que incomoda |
| `horarios_sueno` | text | Horarios de sueno |
| `deporte_equipo` | text | Deporte/equipo favorito |
| `color_favorito` | text | Color favorito |
| `estado_civil` | text | Estado civil |
| `que_buscas_pareja` | text | Que busca en pareja |
| `mejor_atributo_fisico` | text | Mejor atributo fisico |
| `metas_largo_plazo` | text | Metas a largo plazo |
| `que_haces_relajarte` | text | Actividades de relax |
| `que_te_hace_reir` | text | Lo que le hace reir |
| `que_te_motiva_crear` | text | Motivacion para crear |
| `respuesta_cuanto_cobra_encuentro` | text | Script: cuanto cobra |
| `respuesta_muestra_intimas` | text | Script: muestras intimas |
| `estrategia_material_gratis` | text | Script: material gratis |
| `estrategia_problemas_personales` | text | Script: problemas personales |
| `schedule_config` | jsonb | Horario semanal (default '{}') |
| `currency` | text | Moneda preferida (default 'USD') |
| `gfe_disponible` | boolean | Disponible para GFE (default false) |
| `personalidad_marca` | text | Personalidad de marca |
| `estrategia_rechazo` | text | Estrategia de rechazo |
| `tono_emocional` | text | Tono emocional |
| `frases_venta` | text | Frases de venta |
| `usuarios_vip` | text | Gestion usuarios VIP |
| `plataforma_videollamada` | text | Plataforma para videollamadas |
| `estrategia_recuperacion` | text | Recuperacion suscriptores |
| `interesa_dinamicas_grupales` | boolean | Interes en dinamicas grupales (default false) |
| `terminos_afecto` | text | Terminos de afecto preferidos |
| `restricciones_seguridad` | text | Restricciones de contenido |
| `orientacion_perfil` | text | Orientacion declarada |
| `redes_sociales` | text | Links de redes sociales |
| `wishlist_amazon` | text | URL de wishlist Amazon |
| `last_autosave_at` | timestamptz | Timestamp del ultimo autoguardado |

**No se crea tabla `onboarding_responses` separada.** Todos los campos se mapean directamente a columnas de `creators` para mantener consistencia con el patron actual y evitar joins innecesarios.

---

### 2. Auto-guardado

**En `OnboardingWizard.tsx`:**

- Agregar un `useRef` para trackear si hay cambios pendientes (`isDirty`)
- Agregar un `useEffect` con `setInterval` de 30 segundos que:
  1. Verifique que `isDirty` sea true
  2. Llame a una funcion `autoSave()` que guarda silenciosamente los datos actuales
  3. Muestre un indicador discreto "Guardado automaticamente" en el footer
  4. Resetee `isDirty` a false
- Al cambiar de paso (`handleNext` y `handlePrev`), ejecutar `autoSave()` tambien
- La funcion `autoSave()`:
  - Si `editCreatorId` existe: hace UPDATE directo a la tabla `creators` con los datos actuales
  - Si es nuevo: hace INSERT con status "borrador" la primera vez (guardando el ID generado en un ref), y UPDATE las siguientes veces
  - Actualiza `last_autosave_at` en cada guardado
  - No muestra toast de error para no interrumpir (solo log en consola)
- Agregar un indicador visual en el footer: texto pequeno "Guardado hace X seg" con un icono de check verde

**Marca de cambios:**
- Cada funcion `updateStep1`, `updateStep2Psy`, `updateStep3Doc`, `updateStep4` setea `isDirty.current = true`

---

### 3. Logica de Privacidad

Los tres switches en el Paso 1 (`permisoNombreReal`, `permisoEdadReal`, `permisoUbicacion`) ya existen en el formulario. Con la migracion se almacenaran como booleanos en columnas dedicadas.

**Cambios en la vista operativa (`OperacionesTabContent.tsx` e `InfoTabContent.tsx`):**

- Al renderizar el perfil del creador, leer los campos `permiso_nombre_real`, `permiso_edad_real`, `permiso_ubicacion`
- Si `permiso_nombre_real` es `false`:
  - Mostrar `artistic_name` en lugar de `name` en el encabezado del perfil
  - Ocultar el campo "Nombre completo" en la pestaña Info (o mostrar "Protegido")
- Si `permiso_edad_real` es `false`:
  - Mostrar `edad_mostrar` en lugar de `age` / edad calculada de `birth_date`
  - Ocultar fecha de nacimiento real
- Si `permiso_ubicacion` es `false`:
  - Mostrar `ubicacion_artistica` en lugar de `country` / `city`
  - Ocultar direccion real

**Excepciones:** Los usuarios con rol `admin` o `manager` siempre ven todos los datos reales (la restriccion aplica solo para el rol `agent`/chatter).

**Cambios en `CreadorProfileContent.tsx`:**
- Importar `useUserRole` (ya importado)
- Aplicar la logica de privacidad al header del perfil (nombre, edad, ubicacion)
- Pasar un prop `isPrivacyRestricted` a `InfoTabContent` y `OperacionesTabContent`

**Cambios en `CreadoresTable.tsx` y `CreadoresGrid.tsx`:**
- Aplicar la misma logica al mostrar nombre y pais en el listado principal

---

### 4. Actualizacion del Wizard (mapeo a nuevas columnas)

**En `OnboardingWizard.tsx`:**

- Actualizar `buildPayload()` para mapear cada campo directamente a su nueva columna en lugar de serializarlo en `internal_notes`
- Mantener `internal_notes` solo para datos que no tengan columna dedicada (si queda alguno)
- Actualizar la carga de datos existentes (`useEffect` de edicion) para leer de las nuevas columnas directas

---

### 5. Archivos a crear/modificar

| Archivo | Accion |
|---------|--------|
| Migracion SQL | Agregar ~50 columnas a tabla `creators` |
| `src/pages/creadores/onboarding/OnboardingWizard.tsx` | Auto-guardado (interval + on step change), actualizar buildPayload y carga de datos para usar columnas directas |
| `src/pages/creadores/CreadorProfileContent.tsx` | Logica de privacidad en header (nombre, edad, ubicacion) |
| `src/pages/creadores/InfoTabContent.tsx` | Respetar flags de privacidad al mostrar datos personales |
| `src/pages/creadores/OperacionesTabContent.tsx` | Pasar datos ya filtrados por privacidad |
| `src/pages/creadores/CreadoresTable.tsx` | Mostrar nombre artistico y ubicacion artistica si privacidad activa |
| `src/pages/creadores/CreadoresGrid.tsx` | Misma logica de privacidad en cards |
| `src/integrations/supabase/types.ts` | Se actualiza automaticamente tras la migracion |

