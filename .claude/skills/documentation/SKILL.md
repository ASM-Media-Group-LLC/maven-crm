---
name: documentation
description: Devuelve el link de la página viva de la transformación de Maven (se abre y se comparte) y, solo con un avance explícito, lo registra ahí.
---

# /documentation

**Link de la página viva (estable — abrir/compartir):** https://claude.ai/artifact/CfovucgxeBkzYY7zN4CgEx
También está **fijada en la barra lateral** de claude.ai como «Transformación Maven».

Al invocar `/documentation`:

1. **Lo normal — sin argumentos, o con cualquier texto que NO empiece por una etiqueta de registro:** responde de inmediato con el **link de arriba** + 3 líneas sacadas de `docs/transformacion-asm.md`: último hecho · 🔴 urgente (con responsable) · siguiente paso. Nada más: no hagas preguntas, no anotes el texto en el documento, no pegues el documento ni estas instrucciones. Si el texto es una queja («no sirve», «no abre», «no funciona»), trátalo como queja: da el link y pregunta qué falló — **no lo registres**.

2. **Registrar un avance o decisión** solo si el texto empieza por una de estas etiquetas:
   - `hecho: …` → marca lo correspondiente como hecho y súbelo de «Plan» a «Hecho».
   - `decidí: …` / `decidimos: …` → nueva decisión con su porqué.
   - `pendiente: …` → nuevo pendiente (asígnale responsable: Alvaro o Claude).

   Entonces: (a) edita `docs/transformacion-asm.md` con **fecha absoluta** (nada de «hoy»), marca checkboxes y ajusta los contadores de fase; (b) edita `docs/transformacion-asm.html` igual, conservando el diseño (oscuro; ✓ hecho / ! parcial / ○ pendiente; callout de urgente; KPIs; la fecha de «Actualizado»); (c) publica el `.html` al **mismo link** (Artifact con `url: https://claude.ai/artifact/CfovucgxeBkzYY7zN4CgEx`); (d) commit directo a `main` `docs(transformacion): …`; (e) responde con el link y una línea de qué cambió.

3. El documento refleja la **realidad, no la aspiración**: hechos con fecha, pendientes con responsable, decisiones con su porqué. Informe completo de la auditoría (14/10/2026): https://claude.ai/artifact/7YSisjoJmZcFCADexLhUYy — enlázalo si hace falta contexto profundo; no lo dupliques.
