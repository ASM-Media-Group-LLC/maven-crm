// creadora-accesos — los accesos de OnlyFans de cada creadora. QUIÉN y QUÉ: ver
// logica.ts. La base: migrations/20261008120000_creadora_accesos.sql.
//
// verify_jwt = false (config.toml): la sesión se valida aquí con getUser, como
// las funciones del portal, para contestar 401 con un código que la app lea.
//
// Variables: ACCESOS_CRED_KEY (la llave de las contraseñas; sin ella no se
// guarda ni se abre ninguna) y, para el importador, las de R2 de la Oficina
// (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_OFICINA).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { corsFor } from "../_shared/cors.ts";
import { sellador } from "../_shared/sellado.ts";
import { type Columnas, type CreadoraParaEmparejar, type Evento, type Fila, manejar, type Puertos } from "./logica.ts";

const corsHeaders = (req: Request) =>
  corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" });

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const COLUMNAS = "creator_id, of_correo, of_usuario, of_clave_cifrada, of_clave_nonce, of_clave_version, doble_verificacion, clave_cambiada_en, actualizado_en, actualizado_desde";
const llave = sellador("ACCESOS_CRED_KEY");

function r2() {
  const cuenta = Deno.env.get("R2_ACCOUNT_ID");
  const key = Deno.env.get("R2_ACCESS_KEY_ID") ?? Deno.env.get("R2_ACCESS_KEY");
  const secret = Deno.env.get("R2_SECRET_ACCESS_KEY") ?? Deno.env.get("R2_SECRET");
  const bucket = Deno.env.get("R2_BUCKET_OFICINA") ?? "maven-oficina";
  if (!cuenta || !key || !secret) throw new Error("faltan los secretos de R2");
  return {
    cliente: new AwsClient({ accessKeyId: key, secretAccessKey: secret, service: "s3", region: "auto" }),
    base: `https://${cuenta}.r2.cloudflarestorage.com/${bucket}`,
  };
}

function puertosReales(): Puertos {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Con el JWT de quien llama: la RLS decide qué ve.
  const comoPersona = (token: string) =>
    createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

  return {
    persona: async (token) => {
      const { data: { user } } = await admin.auth.getUser(token);
      if (!user) return null;
      return { id: user.id, esCreadora: (user.app_metadata as { tipo?: string } | undefined)?.tipo === "creadora" };
    },
    veCreadora: async (token, creatorId) => {
      const { data } = await comoPersona(token).from("creators").select("id").eq("id", creatorId).maybeSingle();
      return !!data;
    },
    esAdmin: async (userId) => {
      const { data } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
      return data === true;
    },
    esMiFicha: async (userId, creatorId) => {
      const { data } = await admin.from("creadora_cuentas").select("creator_id").eq("user_id", userId).eq("creator_id", creatorId).maybeSingle();
      return !!data;
    },
    leer: async (creatorId) => {
      const { data, error } = await admin.from("creadora_accesos").select(COLUMNAS).eq("creator_id", creatorId).maybeSingle();
      if (error) throw new Error(`no se pudieron leer los accesos: ${error.message}`);
      return (data as Fila | null) ?? null;
    },
    leerVarias: async (ids) => {
      const filas: Fila[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await admin.from("creadora_accesos").select(COLUMNAS).in("creator_id", ids.slice(i, i + 200));
        if (error) throw new Error(`no se pudieron leer los accesos: ${error.message}`);
        filas.push(...((data ?? []) as Fila[]));
      }
      return filas;
    },
    escribir: async (creatorId, cambios: Columnas, quien, desde) => {
      const { error } = await admin.from("creadora_accesos").upsert(
        { creator_id: creatorId, ...cambios, actualizado_por: quien, actualizado_desde: desde },
        { onConflict: "creator_id" },
      );
      if (error) throw new Error(`no se pudieron guardar los accesos: ${error.message}`);
    },
    anotar: async (e) => {
      const { error } = await admin.from("creadora_accesos_eventos").insert(e);
      if (error) throw new Error(`no se pudo anotar: ${error.message}`);
    },
    ultimosEventos: async (creatorId, cuantos) => {
      const { data } = await admin.from("creadora_accesos_eventos")
        .select("accion, desde, campos, en, user_id").eq("creator_id", creatorId).order("en", { ascending: false }).limit(cuantos);
      const filas = (data ?? []) as (Omit<Evento, "quien"> & { user_id: string | null })[];
      const ids = [...new Set(filas.map((f) => f.user_id).filter(Boolean))] as string[];
      const { data: perfiles } = ids.length ? await admin.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
      const nombre = new Map(((perfiles ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
      return filas.map(({ user_id, ...f }) => ({ ...f, quien: user_id ? nombre.get(user_id) ?? null : null }));
    },
    cifrar: (texto) => llave.sellar(texto),
    descifrar: (s) => llave.abrir(s),

    documento: async (token, id) => {
      const { data } = await comoPersona(token).from("documents")
        .select("storage_key, extension, title, deleted_at").eq("id", id).maybeSingle();
      const d = data as { storage_key: string | null; extension: string | null; title: string; deleted_at: string | null } | null;
      if (!d || d.deleted_at || !d.storage_key) return null;
      return { storage_key: d.storage_key, extension: d.extension, title: d.title };
    },
    bajar: async (storageKey) => {
      const { cliente, base } = r2();
      const resp = await cliente.fetch(`${base}/${storageKey}`, { method: "GET" });
      if (!resp.ok) throw new Error(`no se pudo leer la hoja (R2 ${resp.status})`);
      return new Uint8Array(await resp.arrayBuffer());
    },
    hojas: (bytes) => {
      const libro = XLSX.read(bytes, { type: "array" });
      return libro.SheetNames.map((n) =>
        XLSX.utils.sheet_to_json<string[]>(libro.Sheets[n], { header: 1, raw: false, defval: "" }).map((fila) => fila.map((c) => String(c ?? "")))
      );
    },
    creadorasVisibles: async (token) => {
      const ids: string[] = [];
      const cliente = comoPersona(token);
      for (let desde = 0; desde < 10_000; desde += 1000) {
        const { data, error } = await cliente.from("creators").select("id").order("id").range(desde, desde + 999);
        if (error) throw new Error(`no se pudieron leer las creadoras: ${error.message}`);
        ids.push(...((data ?? []) as { id: string }[]).map((c) => c.id));
        if ((data ?? []).length < 1000) break;
      }
      return ids;
    },
    datosParaEmparejar: async (ids) => {
      const out: CreadoraParaEmparejar[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const lote = ids.slice(i, i + 200);
        const [{ data: cs }, { data: negocios }, { data: cuentas }] = await Promise.all([
          admin.from("creators").select("id, name, artistic_name, email, instagram_handle, onlyfans_url").in("id", lote),
          admin.from("creator_business").select("creator_id, platform_username").in("creator_id", lote),
          admin.from("creadora_cuentas").select("creator_id, correo").in("creator_id", lote),
        ]);
        const usuarios = new Map<string, string[]>();
        for (const n of (negocios ?? []) as { creator_id: string; platform_username: string | null }[]) {
          if (n.platform_username) usuarios.set(n.creator_id, [...(usuarios.get(n.creator_id) ?? []), n.platform_username]);
        }
        const portal = new Map(((cuentas ?? []) as { creator_id: string; correo: string }[]).map((c) => [c.creator_id, c.correo]));
        for (const c of (cs ?? []) as { id: string; name: string; artistic_name: string | null; email: string | null; instagram_handle: string | null; onlyfans_url: string | null }[]) {
          out.push({
            id: c.id,
            nombre: c.name,
            nombre_artistico: c.artistic_name,
            correo: c.email,
            correo_portal: portal.get(c.id) ?? null,
            instagram: c.instagram_handle,
            usuarios_of: [...(usuarios.get(c.id) ?? []), ...(c.onlyfans_url ? [c.onlyfans_url] : [])],
          });
        }
      }
      return out;
    },
  };
}

let puertos: Puertos | null = null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "solo_post" }, 405);
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "") || null;
    const body = await req.json().catch(() => ({}));
    puertos ??= puertosReales();
    const res = await manejar(token, body, puertos);
    return json(req, res.body, res.status);
  } catch (e) {
    // El detalle va al log de la función; al navegador, nada que filtre.
    console.error("[creadora-accesos]", (e as Error).message);
    return json(req, { error: "error_interno" }, 500);
  }
});
