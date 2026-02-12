
# Actualizar el campo "País" en el modal "Nuevo Lead" con lista completa

## Cambios

Actualizar el select "País" en `src/pages/leadgen/AddLeadModal.tsx` reemplazando las opciones actuales (México, Colombia, Argentina, España, Estados Unidos, Otro) con la lista completa de 40 países organizados por regiones: Latinoamérica (20 países) y Europa (20 países).

## Estructura de las opciones de País

Las opciones se presentarán en el siguiente orden:

**Sección Latinoamérica:**
- 🇺🇸 Estados Unidos
- 🇲🇽 México
- 🇨🇱 Chile
- 🇨🇴 Colombia
- 🇦🇷 Argentina
- 🇧🇷 Brasil
- 🇵🇪 Perú
- 🇻🇪 Venezuela
- 🇪🇨 Ecuador
- 🇧🇴 Bolivia
- 🇵🇾 Paraguay
- 🇺🇾 Uruguay
- 🇨🇷 Costa Rica
- 🇵🇦 Panamá
- 🇩🇴 República Dominicana
- 🇬🇹 Guatemala
- 🇭🇳 Honduras
- 🇳🇮 Nicaragua
- 🇸🇻 El Salvador
- 🇨🇺 Cuba

**Sección Europa:**
- 🇪🇸 España
- 🇫🇷 Francia
- 🇩🇪 Alemania
- 🇮🇹 Italia
- 🇬🇧 Reino Unido
- 🇵🇹 Portugal
- 🇳🇱 Países Bajos
- 🇧🇪 Bélgica
- 🇨🇭 Suiza
- 🇦🇹 Austria
- 🇸🇪 Suecia
- 🇳🇴 Noruega
- 🇩🇰 Dinamarca
- 🇫🇮 Finlandia
- 🇵🇱 Polonia
- 🇨🇿 República Checa
- 🇬🇷 Grecia
- 🇮🇪 Irlanda
- 🇷🇴 Rumania
- 🇭🇺 Hungría

## Implementación técnica

**Archivo a modificar:** `src/pages/leadgen/AddLeadModal.tsx`

**Cambio específico:** Reemplazar el contenido del `<SelectContent>` en el campo "pais" (líneas 196-203) con todos los `<SelectItem>` correspondientes a los 40 países listados arriba, manteniendo la estructura y los emojis de bandera como prefijo de cada opción.

Los valores de los SelectItem seguirán el patrón de códigos ISO de dos letras (ej: "us", "mx", "cl", etc.) para consistencia y facilidad de integración futura con bases de datos.

## Notas

- Se mantiene el patrón actual de emojis de bandera + nombre del país
- No se agrega separador visual entre regiones en esta versión (Radix UI SelectContent no tiene dividers nativos sin componentes adicionales)
- El campo "Otro" se puede remover o mantener como opción final opcional
- La funcionalidad de selección y validación permanece igual
