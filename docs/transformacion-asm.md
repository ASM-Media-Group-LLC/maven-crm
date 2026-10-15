# Transformación de Maven bajo ASM Tech

> Documentación viva. Se consulta y actualiza con el comando **`/documentation`**.
> **Página viva (abrir/compartir):** https://claude.ai/artifact/CfovucgxeBkzYY7zN4CgEx
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
- **2026-10-14** — **Independización de Jhon, tanda 1:**
  - Super-admin de la plataforma → Alvaro; Jhon retirado de `plataforma_admins`. Aplicado a producción (migración `7098431f`). ✅ live
  - Bot de WhatsApp: Alvaro como única autoridad final; avisos «a Jhon» → «al administrador»; reglas persistentes de la base auditadas (ninguna lo nombra). Commit `90bec3c1` (edge en producción, run `38670096131`).
  - Contacto público (portada + privacidad) y fallback de `demo-request` → `alvaro@maven-ai.me`. ✅ live (`38ea29fe`).
  - Docs/infra que apuntaban al repo viejo `jhonjlopez-sudo` → org ASM (`104adcf3`).
- **2026-10-14** — **Fase 1 completa (5/5):** `/documentation` a prueba de fallos (solo registra con etiqueta explícita `hecho:`/`decidí:`/`pendiente:`) y la página viva fijada en la barra lateral de claude.ai; prosa «quién da accesos / mantenedor» de `ONBOARDING.md` y `STATE.md` a nombre de Alvaro; guarda de frontend corriendo también en `push` a `main` (nuevo `guard-frontend-main.yml`, red de seguridad del flujo rápido).

## Recopilación: qué seguía vivo de Jhon (14/10)

- **Agente Promolog en su Mac** (`MacBook-Air-de-John.local`): 💀 muerto desde el 8-ago. El agente activo corre en `unlok-server-1` (infra de la empresa). **No dependemos de su Mac.**
- **Sesión BLU (chatters)**: ✅ viva, se auto-refresca. Pero la de la agencia «plus» está sembrada con su cuenta personal `unlok.me` (accountId 4). Si cambia su clave, «plus» se cae. **Pendiente: re-sembrarla con cuenta corporativa (necesita credenciales BLU de Alvaro).**
- **Hubstaff**: el PAT se auto-rota en `hubstaff_secrets`; riesgo menor, revisar la semilla.

## ✅ Resuelto (antes urgente)

- [x] **Secret `SUPABASE_ACCESS_TOKEN`** puesto en GitHub Actions (2026-10-14) y deploy de TODAS las edge functions en verde (run `38670096131`, 4m47s). La autoridad del bot de WhatsApp (Alvaro = última palabra) quedó **en producción**; de aquí en adelante el backend se despliega solo al entrar a `main`.

## Plan

### Fase 1 — Control (esta semana)
- [x] Super-admin → Alvaro en `plataforma_admins`, Jhon retirado (migración `7098431f`, live).
- [x] Bot de WhatsApp: Alvaro única autoridad final + avisos «al administrador» + reglas auditadas (`90bec3c1`; en producción).
- [x] Contacto público + `DEMO_REQUEST_TO` → `alvaro@maven-ai.me` (`38ea29fe`, frontend live).
- [x] Docs/infra al repo de ASM (`104adcf3`) + prosa «quién da accesos / mantenedor» en `ONBOARDING.md` y `STATE.md` a nombre de Alvaro.
- [x] Guarda de frontend corriendo también en `push` a `main` (red de seguridad del flujo rápido): nuevo workflow `guard-frontend-main.yml`.

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
