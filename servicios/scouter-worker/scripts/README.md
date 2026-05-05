# scouter migration: kash → maven

One-shot script para llevar `scouter_companies` + `scouter_leads` desde el Postgres de kash (Dokploy) a Supabase Maven mapeando `tenant_id`.

## Qué migra y qué no

✅ Migra:
- `scouter_companies` (upsert por `slug` — si ya existe en Maven con ese slug, reusa el id)
- `scouter_leads` (upsert por `(company_id, instagram_handle)`, idempotente)

❌ NO migra (a propósito):
- `scouter_jobs` — son volátiles, no tiene sentido importar la queue.
- `scouter_lead_favorites` — atados a `user_id` que no existe en Maven.
- `scouter_apify_token_state` / `scouter_apify_budget` — estado runtime.
- `scouter_notifications` / `scouter_notification_reads` — volátiles.

## Setup (una sola vez)

```bash
cd servicios/scouter-worker
bun install            # instala pg + @types/pg + supabase-js
cp scripts/.env.example scripts/.env
# editar scripts/.env con las cuatro credenciales (ver abajo)
```

## Las cuatro credenciales que necesitás

### 1. `KASH_DATABASE_URL`

En Dokploy donde tenés el Postgres "Scouter-db":

1. Andá a la pantalla del service.
2. **External Credentials → External Port (Internet)** → asegurate que está en `5432` (o algún puerto libre) y dale **Save**. Esto expone la DB temporalmente.
3. Copiá el password del campo **Password** (icono de copiar al lado).
4. Construí la URL:
   ```
   postgres://postgres:<PASSWORD>@<DOKPLOY_IP>:5432/scouterdb
   ```
   Con la IP de tu Dokploy (en el ejemplo del screenshot: `217.216.95.7`).

⚠️ **Después de migrar, cerrá el External Port** — Postgres expuesto a internet con password es atacable.

### 2. `MAVEN_SUPABASE_URL`

Ya está en `.env.example`: `https://ygsjkbqpnrsbohygmhyw.supabase.co`

### 3. `MAVEN_SUPABASE_SERVICE_ROLE_KEY`

Supabase Dashboard → **Settings → API → Project API keys → `service_role`** (secret). NO la `anon` — la service_role bypass-ea RLS.

### 4. `MAVEN_TENANT_ID`

Andá al SQL Editor de Maven y corré:

```sql
select id, slug, name from tenants;
```

Copiá el `id` del tenant destino (probablemente ASM Tech).

## Cómo correrlo

```bash
# Primero dry-run: te muestra cuántas companies + leads va a migrar,
# qué slugs ya existen en Maven, y simula los inserts sin escribir nada.
bun run migrate:dry

# Si todo se ve bien, apply de verdad:
bun run migrate:apply
```

Output esperado en dry-run:

```
🟡 Modo DRY-RUN (pasá --apply para escribir en Maven)
🚀 scouter migration kash → maven
   tenant destino: <UUID>
   maven URL:      https://ygsjkbqpnrsbohygmhyw.supabase.co
✅ Conectado a kash Postgres.
✅ Tablas scouter_* en kash: scouter_companies, scouter_leads, scouter_jobs, ...
📊 kash: 3 companies, 247 leads.

📁 Migrando 3 companies…
  + asm-tech (would insert)
  + agency-x (would insert)
  + agency-y (would insert)

🎯 Migrando 247 leads…
  · batch 1: 50 leads — DRY (no insert)
  · batch 2: 50 leads — DRY (no insert)
  ...

📝 Resultado:
   companies migradas: 3
   leads insertados/upserted: 0
   leads skip: 247
   errors: 0

🟡 Era DRY-RUN. Si todo se ve bien, re-correr con --apply.
```

En `--apply` los counts se mueven al lado de "inserted" y vas a poder ver los leads en `/scouter-assist` después.

## Re-runs

Es seguro correr `--apply` varias veces — los upserts en `scouter_leads` (por `(company_id, instagram_handle)`) y `scouter_companies` (por `slug`) son idempotentes. Si volvés a correr el script, no vas a duplicar nada.

## Después de migrar

1. **En Dokploy** → Scouter-db → External Credentials → quitá el External Port y dale Save (cerrá la exposición a internet).
2. **En Maven** → entrá a `/scouter-assist` y verificá que veas los leads.
3. **Si querés re-scorear todo con el LLM nuevo** (porque kash usaba un scorer distinto), una vez que el `scouter-worker` esté deployado podés enquear `score_lead` jobs con un script SQL:
   ```sql
   insert into scouter_jobs (kind, payload, tenant_id, priority)
   select 'score_lead', jsonb_build_object('leadId', id), tenant_id, 5
   from scouter_leads
   where tenant_id = '<MAVEN_TENANT_ID>';
   ```

## Si algo falla

| Error | Probable causa | Fix |
|---|---|---|
| `connection refused` | External Port no está saved en Dokploy | Hacer click en Save y verificar que el puerto esté abierto |
| `password authentication failed` | Password mal copiado | Volver a copiar — ojo con espacios al inicio/final |
| `relation "scouter_companies" does not exist` | Apuntando a la DB equivocada en Dokploy | Verificá que el Database Name del .env sea `scouterdb` |
| `tenant_id violates foreign key` | El UUID del tenant no existe en Maven | Volver a correr el SELECT de tenants y copiar bien el UUID |
| `null value in column "tenant_id"` | Se filtró un row sin tenant — no debería pasar | Compartí el log y vemos |
