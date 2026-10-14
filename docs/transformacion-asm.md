# Transformación de Maven bajo ASM Tech

> Documentación viva. Se consulta y actualiza con el comando **`/documentation`**.
> Informe completo de la auditoría (14/10/2026): https://claude.ai/artifact/7YSisjoJmZcFCADexLhUYy

## Qué está pasando

Maven pasó a ser administrado por **Alvaro (ASM Tech)**. El repositorio, los servicios y el flujo de trabajo se movieron a la organización `ASM-Media-Group-LLC`, el proceso de cambios se volvió «push y al aire» (~1 min), y se están retirando una a una las dependencias que quedaban del constructor anterior. Las reglas de protección de datos de producción se conservan.

## Hecho

- **2026-10-12/13** — Repo espejado a `ASM-Media-Group-LLC/maven-crm` (15 ramas + historia). Los 9 servicios de Dokploy + el frontend repuntados a la conexión de la org; `jhonjlopez` desconectado de Dokploy y de los remotos. Auto-deploy verificado (webhook ~3 s, build ~1 min).
- **2026-10-13/14** — Runner del CI (mini5) re-registrado a la org ASM y verificado en verde (`guard-frontend` pasó end-to-end).
- **2026-10-14** — `CLAUDE.md` reescrito (`fbc3064b`): Alvaro decide; cambios chicos directo a `main`, grandes por PR; verificación proporcional; sección «Datos y producción» intacta.
- **2026-10-14** — Flujo directo a `main` probado en vivo: push → producción en ~1 min.
- **2026-10-14** — Portada pública sin muñequitos: siluetas neutras en toda la página + guarda que impide que vuelvan (`3110ac0e`). En vivo.
- **2026-10-14** — Auditoría completa en 6 áreas (frontend, Supabase, servicios, CI, dependencias, fricciones); informe publicado (link arriba).

## 🔴 Urgente pendiente

- [ ] **Secret `SUPABASE_ACCESS_TOKEN`** en GitHub → repo `ASM-Media-Group-LLC/maven-crm` → Settings → Secrets → Actions (el token se genera en Supabase → Account → Access Tokens), y luego correr el workflow **Deploy Edge Functions** con `deploy_all = true`. **Responsable: Alvaro (5 min).** Sin esto, el próximo cambio de backend NO se despliega (verificado: run 38301565957 falló por este motivo).

## Plan

### Fase 1 — Control (esta semana)
- [ ] Migración que agrega a Alvaro a `plataforma_admins` (hoy solo contiene al constructor anterior) + confirmar su rol `admin`. — Claude
- [ ] Bot de WhatsApp: Alvaro como única autoridad final en el prompt (`whatsapp-agent`), mensajes «avísale a Jhon» → «avísale al administrador», y auditoría de las reglas persistentes guardadas en la base. — Claude
- [ ] Contacto público (portada y privacidad) y `DEMO_REQUEST_TO` a un correo controlado por Alvaro. — **Falta decidir el correo.**
- [ ] Documentación al repo nuevo: `ONBOARDING.md`, `STATE.md`, `infra/scripts/preparar-mac-dev.sh`, compose del baileys-gateway, README del promolog-agent. — Claude
- [ ] Guarda de frontend corriendo también en `push` a `main` (red de seguridad del flujo rápido). — Claude

### Fase 2 — Independencia (siguientes 2 semanas)
- [ ] Verificar titularidad de las cuentas raíz: org de Supabase, Zoho, dominio `maven-ai.me`, VPS de LiveKit, Tailscale, mini5 (asm002/SSH). — Alvaro con guía de Claude
- [ ] Rotación de secretos por pares servicio↔Supabase: `DRIVE_SECRETO`, `MAIL_CRED_KEY`, `READER_TOKEN`, `PROMOLOG_EXT_TOKEN`, API keys de gateways, `LIVEKIT_KEYS`, `RECORDINGS_SIGNING_SECRET`, `X-Cron-Token`, keys `mvk_live`. — Alvaro + Claude
- [ ] `promolog-agent` de la Mac del constructor anterior a una Mac de la empresa (re-loguear las 2 cuentas scanner). — Alvaro
- [ ] Sesión de Hubstaff/BLU con cuenta corporativa (hoy es su cuenta personal). — Alvaro
- [ ] Acceso directo de Alvaro al mini5 y reemplazo del flujo «empuje desde el Mac de Jhon». — Alvaro + Claude
- [ ] Burn-down de los 219 errores preexistentes de tsc (108 están en 2 archivos) + `retry: 1` para los 4 tests flaky conocidos. — Claude

### Fase 3 — Robustez (después)
- [ ] Respaldo del Drive (reabrir la decisión «sin copia de seguridad» del 28/09/2026). — Alvaro decide
- [ ] Deploy scripteado del nas-drive (hoy: scp manual que puede tumbar el Drive si se copia a medias). — Claude
- [ ] Plan B del CI para cuando el mini5 esté apagado (`workflow_dispatch` en ubuntu-latest). — Claude
- [ ] Inventario único servicio → app de Dokploy → dominio → secretos → modo de deploy. — Claude
- [ ] Entorno de pruebas (rama de Supabase con datos sintéticos) para experimentar sin tocar producción. — Claude

## Decisiones

- **2026-10-14** — La sección «Datos y producción» del `CLAUDE.md` se conserva: la base es producción real y esas reglas protegen el negocio de ASM, no al constructor anterior.
- **2026-10-14** — Los ~1.300 comentarios históricos «decisión de Jhon, fecha» NO se renombran en masa: son la memoria de por qué el producto es como es.
- **2026-10-14** — Portada con siluetas neutras en lugar de caras caricaturescas (pedido de Alvaro).
- **2026-10-14** — Las propuestas de homepage nuevo (limpia, cinematográfica, Cowork con scrollytelling) quedan como borradores en sus links; la portada actual sigue siendo la de producción hasta nueva orden.
