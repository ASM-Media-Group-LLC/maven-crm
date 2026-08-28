import { corsFor } from "../_shared/cors.ts";
// chatter-sync — trae de BLU lo que el dashboard de chatters necesita y lo GUARDA.
//
// POR QUÉ GUARDARLO: hoy los masivos y las modelos asignadas se consultan en vivo.
// Si en BLU borran una cuenta para recrearla con el correo nuevo, su histórico se
// va con ella y no hay forma de recuperarlo. Lo que está en Maven, queda.
//
// IDENTIDADES: la persona se guarda una vez y sus cuentas externas se enganchan
// con vigencia. El correo sirve para DESCUBRIR el vínculo, nunca para sostenerlo:
// cuando el equipo pase de @unlok.me a @maven-ai.me, el vínculo ya existe y el
// cambio es invisible. Si en BLU además recrean la cuenta (id nuevo), se cierra
// el vínculo viejo y se abre otro sobre la MISMA persona, así el histórico no se
// parte en dos.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = (req: Request) => corsFor(req);
const json = (req: Request, b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors(req), "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Consulta a BLU reusando la edge `blu-mp` (no duplicamos el WebSocket). */
async function blu(action: string, extra: Record<string, unknown> = {}): Promise<any> {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/blu-mp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ action, ...extra }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || `blu-mp ${action} → ${r.status}`);
  return j?.data ?? j;
}

const localPart = (email: string | null | undefined): string | null => {
  const e = String(email ?? "").trim().toLowerCase();
  const i = e.indexOf("@");
  return i > 0 ? e.slice(0, i) : null;
};

const hoyBogota = () =>
  new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }))
    .toISOString().slice(0, 10);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { action = "all", dia } = await req.json().catch(() => ({}));
    const elDia: string = dia || hoyBogota();
    const resultado: Record<string, unknown> = { dia: elDia };

    // ── IDENTIDADES + ASIGNACIONES ────────────────────────────────────────
    if (action === "all" || action === "identities") {
      const data = await blu("employees");
      const empleados: any[] = data?.employees ?? [];

      // Cuentas de Maven, para cruzar. Se compara por correo completo y, si no,
      // por la parte de antes de la arroba: eso es lo que sobrevive al cambio
      // de dominio.
      const { data: usuarios } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const porEmail = new Map<string, string>();
      const porLocal = new Map<string, string>();
      for (const u of usuarios?.users ?? []) {
        const e = (u.email ?? "").toLowerCase();
        if (!e) continue;
        porEmail.set(e, u.id);
        const lp = localPart(e);
        if (lp && !porLocal.has(lp)) porLocal.set(lp, u.id);
      }

      let creadas = 0, revinculadas = 0, sinCuenta = 0;
      const asignaciones: Array<{ dia: string; identity_id: string; blu_model_id: number }> = [];

      for (const e of empleados) {
        if (e?.id == null) continue;
        const bluId = String(e.id);
        const email = (e.email ?? "").toLowerCase().trim() || null;
        const lp = localPart(email);
        const mavenId = (email && porEmail.get(email)) || (lp && porLocal.get(lp)) || null;
        const matchedBy = email && porEmail.get(email) ? "email" : (mavenId ? "email_local" : null);

        // ¿Ya conocemos esta cuenta de BLU?
        const { data: link } = await admin.from("chatter_identity_link")
          .select("id, identity_id").eq("source", "blu").eq("external_id", bluId)
          .is("valid_to", null).maybeSingle();

        let identityId = link?.identity_id ?? null;

        if (!identityId) {
          // ¿Es la MISMA persona con una cuenta nueva? Se busca por usuario de
          // Maven y, si no tiene, por la parte local del correo.
          const { data: existente } = mavenId
            ? await admin.from("chatter_identity").select("id").eq("maven_user_id", mavenId).maybeSingle()
            : await admin.from("chatter_identity").select("id").eq("email_local", lp).maybeSingle();

          if (existente?.id) {
            identityId = existente.id;
            // La cuenta anterior en BLU deja de estar vigente: la persona sigue
            // siendo la misma y su histórico no se parte.
            await admin.from("chatter_identity_link")
              .update({ valid_to: new Date().toISOString() })
              .eq("identity_id", identityId).eq("source", "blu").is("valid_to", null);
            revinculadas++;
          } else {
            const { data: nueva, error: insErr } = await admin.from("chatter_identity")
              .insert({
                display_name: e.fullName ?? email ?? `BLU ${bluId}`,
                maven_user_id: mavenId,
                email_local: lp,
                is_chatter: !e.isOwner,
                active: !e.deactivated && e.status === "Active",
              })
              .select("id").single();
            if (insErr) continue;
            identityId = nueva.id;
            creadas++;
          }

          await admin.from("chatter_identity_link").insert({
            identity_id: identityId, source: "blu", external_id: bluId,
            external_email: email, matched_by: matchedBy ?? "manual",
          });
        } else {
          // Vínculo ya existente: se refresca lo que puede haber cambiado
          // (nombre, correo nuevo, si sigue activo).
          await admin.from("chatter_identity")
            .update({
              display_name: e.fullName ?? undefined,
              email_local: lp ?? undefined,
              maven_user_id: mavenId ?? undefined,
              active: !e.deactivated && e.status === "Active",
              updated_at: new Date().toISOString(),
            })
            .eq("id", identityId);
          if (email) {
            await admin.from("chatter_identity_link")
              .update({ external_email: email })
              .eq("source", "blu").eq("external_id", bluId).is("valid_to", null);
          }
        }

        if (!mavenId) sinCuenta++;

        for (const modelId of (e.assignedCreators ?? [])) {
          if (Number.isFinite(Number(modelId))) {
            asignaciones.push({ dia: elDia, identity_id: identityId!, blu_model_id: Number(modelId) });
          }
        }
      }

      if (asignaciones.length) {
        // Snapshot del día: si hoy le cambian las modelos, los días pasados no se
        // alteran y las notas viejas siguen explicándose con lo que había.
        await admin.from("chatter_creator_assignment_daily")
          .upsert(asignaciones, { onConflict: "dia,identity_id,blu_model_id", ignoreDuplicates: true });
      }

      resultado.identidades = { empleados: empleados.length, creadas, revinculadas, sinCuentaMaven: sinCuenta };
      resultado.asignaciones = asignaciones.length;
    }

    // ── MASIVOS ───────────────────────────────────────────────────────────
    if (action === "all" || action === "masivos") {
      const data = await blu("models");
      const modelos: any[] = data?.models ?? data?.rows ?? [];
      const num = (v: unknown) => Number(v) || 0;

      // Para atribuir cada masivo a una persona: BLU lo firma con un NOMBRE.
      const { data: identidades } = await admin.from("chatter_identity").select("id, display_name");
      const porNombre = new Map<string, string>();
      for (const i of identidades ?? []) {
        porNombre.set(String(i.display_name).trim().toLowerCase(), i.id);
      }

      let guardados = 0, sinAtribuir = 0;
      for (const m of modelos) {
        const modelId = Number(m?.id ?? m?.modelId);
        if (!Number.isFinite(modelId)) continue;
        const nombreModelo = m?.name ?? m?.username ?? null;

        const filas: any[] = [];
        try {
          const ofm = await blu("of-mass", { modelId });
          for (const r of (ofm?.rows ?? [])) {
            filas.push({
              blu_id: `ofm-${r.id ?? r.queueId}`, kind: "of-mass",
              copy: r.message ?? null, sender: r.senderName ?? null,
              price: num(r.price), sent: num(r.sent), viewed: num(r.viewed),
              purchased: num(r.purchased), earnings: num(r.earnings), sentAt: r.sentAt ?? null,
            });
          }
        } catch { /* un modelo que falle no corta la corrida */ }
        try {
          const sm = await blu("smart-messages", { modelId });
          for (const r of (sm?.messages ?? [])) {
            filas.push({
              blu_id: `pri-${r.id}`, kind: "priority",
              copy: r.name ?? r.textPreview ?? null, sender: r.senderName ?? null,
              price: num(r.price), sent: num(r.sent ?? r.sentCount), viewed: num(r.viewed ?? r.viewedCount),
              purchased: num(r.purchased ?? r.purchasedCount), earnings: num(r.earnings),
              sentAt: r.sentAt ?? r.publishedAt ?? null,
            });
          }
        } catch { /* idem */ }

        const rows = filas.map((f) => {
          const idn = f.sender ? porNombre.get(String(f.sender).trim().toLowerCase()) ?? null : null;
          if (!idn) sinAtribuir++;
          return {
            blu_id: f.blu_id, blu_model_id: modelId, model_name: nombreModelo,
            sender_name: f.sender, identity_id: idn, kind: f.kind, copy: f.copy,
            price: f.price, sent: f.sent, viewed: f.viewed, purchased: f.purchased,
            earnings: f.earnings, sent_at: f.sentAt,
          };
        });
        if (rows.length) {
          const { error } = await admin.from("chatter_mass_messages").upsert(rows, { onConflict: "blu_id" });
          if (!error) guardados += rows.length;
        }
      }
      resultado.masivos = { modelos: modelos.length, guardados, sinAtribuir };
    }

    // ── NOTAS ─────────────────────────────────────────────────────────────
    if (action === "all" || action === "notas") {
      const { data: n, error } = await admin.rpc("calcular_notas_chatters", { _dia: elDia });
      if (error) resultado.notas = { error: error.message };
      else resultado.notas = { calculadas: n };
    }

    return json(req, { ok: true, ...resultado });
  } catch (e) {
    console.error("[chatter-sync]", e);
    return json(req, { error: (e as Error).message }, 500);
  }
});
