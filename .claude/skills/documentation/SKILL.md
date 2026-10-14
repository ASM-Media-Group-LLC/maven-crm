---
name: documentation
description: Muestra y mantiene la página viva de la transformación de Maven bajo ASM — devuelve el link que se abre y comparte, y registra avances y decisiones.
---

# /documentation — la página viva de la transformación

- **Fuente de verdad:** `docs/transformacion-asm.md`.
- **Página viva (link estable para abrir/compartir):** https://claude.ai/artifact/CfovucgxeBkzYY7zN4CgEx
- **Base HTML de esa página:** `docs/transformacion-asm.html` — se edita (no se regenera desde cero).

Al invocar `/documentation`:

1. Lee `docs/transformacion-asm.md`.
2. **Sin argumentos:** responde con el **link de la página viva** + 3 líneas: último hecho · urgente (con responsable) · siguiente paso. Nada de pegar el documento entero ni estas instrucciones.
3. **Con argumentos** (un avance o decisión, p. ej. `/documentation hecho: rotamos DRIVE_SECRETO` o `/documentation decidimos X porque Y`):
   1. Actualiza `docs/transformacion-asm.md`: entrada con **fecha absoluta** (nada de «hoy»), marca los checkboxes, mueve lo terminado a «Hecho», ajusta los contadores de fase.
   2. Edita `docs/transformacion-asm.html` para reflejar el mismo cambio, conservando el diseño (oscuro; fases con checklist ✓ hecho / ! parcial / ○ pendiente; callout de urgente; KPIs de progreso; la fecha de «Actualizado»).
   3. Commitea directo a `main`: `docs(transformacion): …` (flujo rápido del CLAUDE.md).
   4. Publica `docs/transformacion-asm.html` al **mismo link** (Artifact con `url: https://claude.ai/artifact/CfovucgxeBkzYY7zN4CgEx`) y responde con el link.
4. El documento refleja la **realidad, no la aspiración**: hechos con fecha, pendientes con responsable (Alvaro / Claude), decisiones con su porqué. Si el plan cambió de rumbo, se corrige y se anota la decisión.
5. Informe completo de la auditoría (14/10/2026): https://claude.ai/artifact/7YSisjoJmZcFCADexLhUYy — enlázalo cuando haga falta contexto profundo; no dupliques su contenido.
