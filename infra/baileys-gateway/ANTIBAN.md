# Blindaje anti-ban — gateway Baileys (maven-bot)

WhatsApp banea números que corren **clientes NO oficiales** (Baileys se hace pasar por
WhatsApp Web). El baneo **no depende del volumen** ni de "a cuánta gente le hablaste":
depende de la huella de cliente automatizado. **Ningún ajuste de código lo previene al
100%** — solo baja la frecuencia. Lo real es *automatizar con criterio + recuperar rápido*.

> Folclore que NO sirve (no perder tiempo): rotar el `browser`, simular "typing",
> keepAlive, cambiar user-agent. No evitan baneos.

## Lo que el gateway YA hace (no tocar, ya es lo correcto)
- `alwaysOnline=false` (`markOnlineOnConnect=false`) → no grita "online 24/7".
- Valida `onWhatsApp` antes de enviar → no le pega a números inexistentes.
- **Circuit breaker**: pausa la línea si sube la tasa de inválidos (`line_paused_high_invalid_rate`).
- **Warm-up por edad de línea** para envíos en frío (`outreach:true`): <3d→20, <7d→80, <14d→250, luego 800/día.

## Reglas de operación (esto es lo que mueve la aguja)
1. **Número dedicado al bot.** No lo uses para nada personal ni lo metas a grupos random.
2. **Calentá los números nuevos ANTES de automatizar.** Un número nuevo debe tener uso
   humano orgánico varios días (chatear a mano, recibir, mandar) antes de conectarlo al bot.
   Un número fresco + automatización inmediata = baneo casi seguro.
3. **Un cambio a la vez.** No metas un número a un **grupo nuevo** *y* le arranques
   automatización el **mismo día** (fue el gatillo del baneo de 2026-07-07).
4. **Mantené SIEMPRE un segundo número calentándose** como repuesto, listo para swap.
5. **Automatización modesta.** Los digests/nudges automáticos son el mayor factor de riesgo.
   Cuantos menos envíos automáticos por ese número, más dura. (Si algún día pesa demasiado,
   la salida real es mover lo interno a un canal oficial — Telegram bot.)

## Swap rápido de número (minimizar downtime)
El gateway es **multi-sesión**. El número default es `INSTANCE_NAME=maven-bot` (creds en la
raíz de `AUTH_DIR`, no se auto-borran). La forma limpia de tener un repuesto:

1. **Prepará el repuesto como una instancia SEPARADA** (no la default). En `/manager`
   (protegido por password) conectá el segundo número bajo un instance name propio
   (ej. `maven-bot-2`). Sus creds viven en `AUTH_DIR/maven-bot-2/`.
2. **Calentá esa instancia** unos días (uso a mano) — el warm-up cap usa `firstConnectedAt`.
3. **Cuando baneen la línea activa**, el swap es cambiar el secret de Supabase
   `WHATSAPP_EVOLUTION_INSTANCE` → `maven-bot-2` (dashboard Supabase → Edge Functions →
   Secrets). Los envíos (`whatsapp-send`) empiezan a salir por el repuesto al instante.
   Las creds viejas quedan intactas por si la apelación las recupera.
4. Re-registrá el nuevo número en `whatsapp_channels`/config si aplica, y re-agregalo a los
   grupos (Marketing/Ventas, Managers) — de a uno, sin arrancar automatización el mismo día (regla 3).

## Cuando te banean
1. **Apelá** en la app del número (dueño): Configuración → Ayuda → pedir revisión. Fijate si
   el mensaje dice *temporal* (vuelve solo en horas/días) o *permanente*.
2. En paralelo, **swap al repuesto** (arriba) para no quedar ciego.
3. Registrá qué cambió los días previos (grupos nuevos, picos de automatización) para ajustar.

## Si en el futuro el riesgo pesa demasiado
La prevención de raíz es sacar la **automatización interna** de WhatsApp a un **bot de
Telegram** (oficial, no se banea) y dejar WhatsApp solo para la bandeja con creadoras/leads
(tráfico humano). Está evaluado; se pospuso por adopción del staff (2026-07-07).
