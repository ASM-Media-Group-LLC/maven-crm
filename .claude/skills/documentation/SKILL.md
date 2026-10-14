---
name: documentation
description: Consulta o actualiza la documentación viva de la transformación de Maven bajo ASM (estado, plan, decisiones) en docs/transformacion-asm.md.
---

# /documentation — la documentación viva de la transformación

El documento es `docs/transformacion-asm.md`. Este comando lo consulta y lo mantiene.

Al invocarse:

1. Lee `docs/transformacion-asm.md` completo.
2. **Sin argumentos:** responde un resumen corto del estado — lo último hecho, lo urgente pendiente (con responsable) y el siguiente paso de cada fase. No pegues el documento entero.
3. **Con argumentos** (por ejemplo `/documentation hecho: rotamos DRIVE_SECRETO` o `/documentation decidimos que el contacto es contacto@maven-ai.me`): registra el cambio en la sección que corresponde, con fecha absoluta (nada de «hoy» o «ayer»), marca los checkboxes que se completaron y mueve lo terminado de «Plan» a «Hecho». Después commitea directo a `main` con un mensaje `docs(transformacion): …`, siguiendo el flujo rápido del CLAUDE.md.
4. Mantén el documento fiel y corto: hechos con fecha, pendientes con responsable (Alvaro o Claude), decisiones con su porqué. Si algo del plan cambió de rumbo, se corrige el plan y se anota la decisión — el documento refleja la realidad, no la aspiración.
5. El informe completo de la auditoría del 14/10/2026 vive en https://claude.ai/artifact/7YSisjoJmZcFCADexLhUYy — enlázalo cuando haga falta contexto profundo; no dupliques su contenido en el documento.
