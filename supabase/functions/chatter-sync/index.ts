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

const cors = (req: Request) =>
  corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token" });
const json = (req: Request, b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors(req), "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Consulta a BLU reusando la edge `blu-mp` (no duplicamos el WebSocket). */
async function blu(action: string, extra: Record<string, unknown> = {}): Promise<any> {
  // `agency` viaja hasta blu-mp, que elige la sesión correcta. Sin ella, Plus.
  const r = await fetch(`${SUPABASE_URL}/functions/v1/blu-mp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ action, ...extra }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || `blu-mp ${action} → ${r.status}`);
  return j?.data ?? j;
}

// Parte del correo antes de la arroba, SIN el sufijo +N.
// En BLU una misma persona se registra en Massive y en Plus con un solo correo
// usando `nombre+1@...`: sin quitar ese sufijo quedaria como dos personas y su
// dia se partiria en dos notas, ninguna de las cuales lo describe.
/** Dominio destino de la migracion de correos del equipo. */
const DOMINIO_NUEVO = "maven-ai.me";

const localPart = (email: string | null | undefined): string | null => {
  const e = String(email ?? "").trim().toLowerCase();
  const i = e.indexOf("@");
  if (i <= 0) return null;
  return e.slice(0, i).split("+")[0] || null;
};

const hoyBogota = () =>
  new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }))
    .toISOString().slice(0, 10);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // La función corre con service_role y escribe identidades y notas de todo el
    // equipo: sin este control, con verify_jwt=false la podría disparar
    // cualquiera con la URL. Dos puertas, como el resto del proyecto:
    //   · el cron entra con X-Cron-Token (así no viaja una llave de service_role)
    //   · una persona entra con su JWT, y tiene que ser supervisor o superior
    const cronToken = req.headers.get("x-cron-token");
    const cronEsperado = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
    const esCron = !!cronToken && !!cronEsperado && cronToken === cronEsperado;

    const auth = req.headers.get("Authorization") ?? "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!esCron && !bearer) return json(req, { error: "Unauthorized" }, 401);

    if (!esCron && bearer !== SERVICE_KEY) {
      const asUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: auth } },
      });
      const { data: u } = await asUser.auth.getUser();
      if (!u?.user) return json(req, { error: "Unauthorized" }, 401);
      const { data: puede } = await admin.rpc("is_in_role_group", {
        _user_id: u.user.id, _group: "supervisor_or_above",
      });
      if (!puede) return json(req, { error: "Solo supervisores pueden sincronizar" }, 403);
    }

    const body = await req.json().catch(() => ({} as any));
    const { action = "all", dia } = body;
    const elDia: string = dia || hoyBogota();
    const resultado: Record<string, unknown> = { dia: elDia };

    // ── IDENTIDADES + ASIGNACIONES ────────────────────────────────────────
    if (action === "all" || action === "identities") {
      // ── LAS DOS EMPRESAS ────────────────────────────────────────────────
      //
      // El equipo tiene Plus y Massive, y en BLU son DOS CUENTAS distintas: el
      // correo normal en Plus y el `+1` en Massive. BLU ata cada sesión a una
      // cuenta, así que hay que preguntarle a cada una por separado.
      //
      // Una persona puede tener cuenta en las dos, y las dos cuentan para ella:
      // `localPart` ya recorta el `+1`, así que ambas caen en la misma
      // identidad de Maven y sus ventas se suman.
      const { data: sesiones } = await admin.from("blu_session").select("agency");
      const agencias = [...new Set((sesiones ?? []).map((s: { agency: string }) => s.agency))];
      if (agencias.length === 0) agencias.push("plus");

      let creadasT = 0, revinculadasT = 0, sinCuentaT = 0, empleadosT = 0;
      const asignacionesT: Array<{ dia: string; identity_id: string; blu_model_id: number; agency: string }> = [];

      for (const ag of agencias) {
      const data = await blu("employees", { agency: ag });
      const empleados: any[] = data?.employees ?? [];

      // Cuentas de Maven, para cruzar. Se compara por correo completo y, si no,
      // por la parte de antes de la arroba: eso es lo que sobrevive al cambio
      // de dominio.
      const { data: usuarios } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const porEmail = new Map<string, string>();
      const porLocal = new Map<string, string>();
      // Cuentas que ya estan en el dominio destino, indexadas por parte local.
      const porLocalNuevo = new Map<string, string>();
      for (const u of usuarios?.users ?? []) {
        const e = (u.email ?? "").toLowerCase();
        if (!e) continue;
        porEmail.set(e, u.id);
        const lp = localPart(e);
        if (!lp) continue;
        if (!porLocal.has(lp)) porLocal.set(lp, u.id);
        if (e.endsWith("@" + DOMINIO_NUEVO)) porLocalNuevo.set(lp, u.id);
      }

      let creadas = 0, revinculadas = 0, sinCuenta = 0;
      const asignaciones: Array<{ dia: string; identity_id: string; blu_model_id: number; agency: string }> = [];

      for (const e of empleados) {
        if (e?.id == null) continue;
        const bluId = String(e.id);
        const email = (e.email ?? "").toLowerCase().trim() || null;
        const lp = localPart(email);
        // La cuenta del DOMINIO NUEVO gana incluso sobre el correo exacto.
        // Durante la migracion hay gente con las dos cuentas en Maven, y BLU
        // todavia trae la vieja: engancharse al correo exacto ata la identidad
        // a la cuenta que van a borrar, y el dia que desaparece queda huerfana
        // y la persona se cae del dashboard (paso con Manuela Zapata).
        const nueva = lp ? porLocalNuevo.get(lp) : null;
        const mavenId = nueva || (email && porEmail.get(email)) || (lp && porLocal.get(lp)) || null;
        const matchedBy = nueva
          ? "email_local"
          : (email && porEmail.get(email) ? "email" : (mavenId ? "email_local" : null));

        // ¿Ya conocemos esta cuenta de BLU?
        const { data: link } = await admin.from("chatter_identity_link")
          .select("id, identity_id").eq("source", "blu").eq("agency", ag).eq("external_id", bluId)
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
              .eq("identity_id", identityId).eq("source", "blu").eq("agency", ag)
              .is("valid_to", null);
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
            identity_id: identityId, source: "blu", agency: ag, external_id: bluId,
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
              .eq("source", "blu").eq("agency", ag).eq("external_id", bluId)
              .is("valid_to", null);
          }
        }

        if (!mavenId) sinCuenta++;

        for (const modelId of (e.assignedCreators ?? [])) {
          if (Number.isFinite(Number(modelId))) {
            asignaciones.push({ dia: elDia, identity_id: identityId!, blu_model_id: Number(modelId), agency: ag });
          }
        }
      }

      if (asignaciones.length) {
        // Snapshot del día: si hoy le cambian las modelos, los días pasados no se
        // alteran y las notas viejas siguen explicándose con lo que había.
        // La agencia va en la clave: el modelo 38 de Plus y el 38 de Massive
        // pueden ser creadoras distintas y una pisaría a la otra.
        await admin.from("chatter_creator_assignment_daily")
          .upsert(asignaciones, { onConflict: "dia,identity_id,agency,blu_model_id", ignoreDuplicates: true });
      }

      empleadosT += empleados.length; creadasT += creadas;
      revinculadasT += revinculadas; sinCuentaT += sinCuenta;
      asignacionesT.push(...asignaciones);
      } // fin del bucle por agencia

      resultado.identidades = {
        agencias, empleados: empleadosT, creadas: creadasT,
        revinculadas: revinculadasT, sinCuentaMaven: sinCuentaT,
      };
      resultado.asignaciones = asignacionesT.length;
    }

    // ── SONDEO (diagnostico) ──────────────────────────────────────────────
    // Devuelve crudo lo que responde BLU, para poder mirar la forma del dato
    // antes de construir encima. No escribe nada.
    // Diagnóstico: qué ve la sesión de BLU que usa Maven. Sirve para saber si
    // alcanza UNA agencia o las dos (Plus y Massive).
    if (action === "blu-whoami") {
      return json(req, await blu("whoami", {}));
    }

    if (action === "probe") {
      const data = await blu("employee-reports", {
        startDate: body.startDate ?? elDia,
        endDate: body.endDate ?? elDia,
        creatorIds: body.creatorIds ?? [],
      });
      const emps: any[] = data?.employees ?? [];
      const activo = emps.find((e) => (e?.metrics?.totalSales ?? 0) > 0);
      return json(req, {
        ok: true, rango: [body.startDate ?? elDia, body.endDate ?? elDia],
        total: emps.length,
        // Crudo, para ver si el rango viene desglosado por dia o agregado.
        clavesTop: activo ? Object.keys(activo) : [],
        ejemplo: activo ? { name: activo.name, metrics: activo.metrics, otros: Object.fromEntries(
          Object.entries(activo).filter(([k]) => !["name","metrics","deltas","email","avatar","roles"].includes(k))) } : null,
        activos: emps
          .filter((e) => (e?.metrics?.totalSales ?? 0) > 0)
          .map((e) => [e.name, e.metrics?.totalSales ?? 0]),
      });
    }

    // ── MODELOS POR CHATTER Y DIA ─────────────────────────────────────────
    // Una consulta por modelo: filtrando employee-reports por creatorIds, BLU
    // devuelve solo a quienes la atendieron ese dia y cuanto vendieron. Es el
    // unico lugar donde existe el cruce chatter-modelo-dia.
    //
    // Va por LOTES porque son ~70 modelos por dia a ~10s cada una: en una sola
    // invocacion se pasaria del limite de la edge function. El que llama manda
    // el lote y reintenta con el siguiente.
    if (action === "model-day") {
      const modelIds: number[] = Array.isArray(body.modelIds)
        ? body.modelIds.map(Number).filter(Number.isFinite)
        : [];
      if (!modelIds.length) return json(req, { error: "modelIds requerido" }, 400);

      // De qué empresa es este lote. Los ids de modelo NO son únicos entre Plus
      // y Massive, así que preguntarle a la agencia equivocada devolvería otra
      // creadora — o nada.
      const ag = String(body.agency ?? "plus").toLowerCase() === "massive" ? "massive" : "plus";

      // Mapa cuenta-de-BLU → persona, por el vinculo vigente DE ESTA AGENCIA.
      const { data: links } = await admin.from("chatter_identity_link")
        .select("identity_id, external_id").eq("source", "blu").eq("agency", ag)
        .is("valid_to", null);
      const porBluId = new Map<string, string>();
      for (const l of links ?? []) porBluId.set(String(l.external_id), l.identity_id);

      // Nombre de cada modelo, para no guardar filas anonimas. BLU lo trae en
      // `internalName` (como la llama el equipo), con el perfil de OF anidado
      // en `aboutMe` como respaldo.
      const nombreDeModelo = new Map<number, string>();
      try {
        const md = await blu("models", { agency: ag });
        for (const m of (md?.models ?? md?.rows ?? [])) {
          const id = Number(m?.id);
          const nombre = m?.internalName ?? m?.aboutMe?.name ?? m?.aboutMe?.username ?? null;
          if (Number.isFinite(id) && nombre) nombreDeModelo.set(id, String(nombre));
        }
      } catch { /* sin nombres la ingesta sigue: el id igual identifica la modelo */ }

      const filas: any[] = [];
      const cobertura: any[] = [];
      let sinIdentidad = 0;
      const fallidos: number[] = [];

      for (const modelId of modelIds) {
        let emps: any[];
        try {
          const data = await blu("employee-reports", {
            startDate: elDia, endDate: elDia, creatorIds: [modelId], agency: ag,
          });
          emps = data?.employees ?? [];
        } catch {
          // Un modelo que falla NO se marca como cubierto: si se marcara, un dia
          // incompleto pasaria por completo y la nota saldria con menos modelos
          // de las reales.
          fallidos.push(modelId);
          continue;
        }

        let conActividad = 0;
        for (const e of emps) {
          const m = e?.metrics ?? {};
          const ventas = Number(m.totalSales) || 0;
          const fans = Number(m.fansChatted) || 0;
          if (ventas === 0 && fans === 0) continue; // no la atendio ese dia
          conActividad++;
          const idn = porBluId.get(String(e.id));
          if (!idn) { sinIdentidad++; continue; }
          filas.push({
            dia: elDia, identity_id: idn, agency: ag, blu_model_id: modelId,
            model_name: nombreDeModelo.get(modelId) ?? null,
            sales: ventas, fans_chatted: fans,
            sold_messages: Number(m.soldMessages) || 0,
          });
        }
        cobertura.push({ dia: elDia, agency: ag, blu_model_id: modelId, chatters: conActividad });
      }

      if (filas.length) {
        await admin.from("chatter_model_daily")
          .upsert(filas, { onConflict: "dia,identity_id,agency,blu_model_id" });
      }
      if (cobertura.length) {
        await admin.from("chatter_model_daily_sync")
          .upsert(cobertura, { onConflict: "dia,agency,blu_model_id" });
      }

      return json(req, {
        ok: true, dia: elDia, agency: ag, modelos: modelIds.length,
        cubiertos: cobertura.length, fallidos, filas: filas.length, sinIdentidad,
      });
    }

    // ── VENTANA LARGA POR MODELO ──────────────────────────────────────────
    // Una consulta por modelo con un RANGO de fechas. BLU devuelve el total
    // agregado de cada chatter en esa modelo durante la ventana. Es lo que hace
    // falta para la vara, y baja el costo de ~990 consultas (33 modelos x 30
    // dias) a 33.
    if (action === "model-window") {
      const modelIds: number[] = Array.isArray(body.modelIds)
        ? body.modelIds.map(Number).filter(Number.isFinite) : [];
      const desde = String(body.startDate ?? "");
      const hasta = String(body.endDate ?? "");
      if (!modelIds.length) return json(req, { error: "modelIds requerido" }, 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
        return json(req, { error: "startDate y endDate requeridos (YYYY-MM-DD)" }, 400);
      }

      const { data: links } = await admin.from("chatter_identity_link")
        .select("identity_id, external_id").eq("source", "blu").is("valid_to", null);
      const porBluId = new Map<string, string>();
      for (const l of links ?? []) porBluId.set(String(l.external_id), l.identity_id);

      const filas: any[] = [];
      const fallidos: number[] = [];
      let sinIdentidad = 0;

      for (const modelId of modelIds) {
        let emps: any[];
        try {
          const data = await blu("employee-reports", {
            startDate: desde, endDate: hasta, creatorIds: [modelId],
          });
          emps = data?.employees ?? [];
        } catch { fallidos.push(modelId); continue; }

        for (const e of emps) {
          const m = e?.metrics ?? {};
          const ventas = Number(m.totalSales) || 0;
          const fans = Number(m.fansChatted) || 0;
          if (ventas === 0 && fans === 0) continue;
          const idn = porBluId.get(String(e.id));
          if (!idn) { sinIdentidad++; continue; }
          filas.push({
            ventana_desde: desde, ventana_hasta: hasta,
            identity_id: idn, blu_model_id: modelId,
            sales: ventas, fans_chatted: fans,
          });
        }
      }

      if (filas.length) {
        await admin.from("chatter_model_window")
          .upsert(filas, { onConflict: "ventana_desde,ventana_hasta,identity_id,blu_model_id" });
      }
      return json(req, {
        ok: true, ventana: [desde, hasta], modelos: modelIds.length,
        fallidos, filas: filas.length, sinIdentidad,
      });
    }

    // ── MASIVOS ───────────────────────────────────────────────────────────
    if (action === "all" || action === "masivos") {
      // Cada modelo son DOS consultas (of-mass + smart-messages), asi que
      // recorrerlas todas de una se pasa del limite de la edge function. El que
      // llama puede mandar un lote de modelIds; sin lote, las trae todas.
      const soloEstos: number[] = Array.isArray(body.modelIds)
        ? body.modelIds.map(Number).filter(Number.isFinite) : [];
      const data = await blu("models");
      let modelos: any[] = data?.models ?? data?.rows ?? [];
      if (soloEstos.length) {
        const set = new Set(soloEstos);
        modelos = modelos.filter((m: any) => set.has(Number(m?.id ?? m?.modelId)));
      }
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
        // BLU nombra a la modelo en `internalName` (como la llama el equipo) y
        // trae el perfil de OF en `aboutMe`. No hay `name` ni `username` arriba.
        const nombreModelo = m?.internalName ?? m?.aboutMe?.name ?? m?.aboutMe?.username ?? null;

        // of-mass y smart-messages son DOS VISTAS DEL MISMO MENSAJE, no dos
        // mensajes: comparten el id. Una muestra la cola (sent en 0 hasta que
        // sale) y la otra el envio ya hecho. Prefijar el id con el endpoint los
        // duplicaba y las filas encoladas metian ceros en los totales.
        //
        // Se juntan por id y gana la version con mas envios, que es la real.
        const porId = new Map<string, any>();
        const juntar = (f: any) => {
          const previo = porId.get(f.blu_id);
          if (!previo || f.sent > previo.sent) porId.set(f.blu_id, { ...previo, ...f });
        };

        try {
          const ofm = await blu("of-mass", { modelId });
          for (const r of (ofm?.rows ?? [])) {
            const id = r.id ?? r.queueId;
            if (id == null) continue;
            juntar({
              blu_id: String(id), kind: "of-mass",
              copy: r.message ?? null, sender: r.senderName ?? null,
              price: num(r.price), sent: num(r.sent), viewed: num(r.viewed),
              purchased: num(r.purchased), earnings: num(r.earnings), sentAt: r.sentAt ?? null,
            });
          }
        } catch { /* un modelo que falle no corta la corrida */ }
        try {
          const sm = await blu("smart-messages", { modelId });
          for (const r of (sm?.messages ?? [])) {
            if (r.id == null) continue;
            juntar({
              blu_id: String(r.id), kind: "priority",
              copy: r.name ?? r.textPreview ?? null, sender: r.senderName ?? null,
              price: num(r.price), sent: num(r.sent ?? r.sentCount), viewed: num(r.viewed ?? r.viewedCount),
              purchased: num(r.purchased ?? r.purchasedCount), earnings: num(r.earnings),
              sentAt: r.sentAt ?? r.publishedAt ?? null,
            });
          }
        } catch { /* idem */ }

        const filas = [...porId.values()];
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
