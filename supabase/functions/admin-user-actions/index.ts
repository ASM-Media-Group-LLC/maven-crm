import { corsFor } from "../_shared/cors.ts";
import { assertCanManage } from "../_shared/user-hierarchy.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  DOMINIO_CASILLA,
  direccionSugerida,
  provisionMailbox,
  provisioningConfigured,
  type ProvisionResult,
} from "../_shared/mail-provision.ts";
import { deleteMailbox, listAccounts, zohoConfigured } from "../_shared/zoho.ts";

const corsHeaders = (req: Request) => corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" });

// Días que una cuenta eliminada queda recuperable, como en Google Workspace.
// Pasado ese plazo, el cron la purga de verdad (borrado destructivo de siempre).
const DIAS_DE_PAPELERA = 30;

// Deja constancia en public.cuenta_eventos. Guarda nombre y correo COMO COPIA
// porque la bitácora tiene que seguir legible después de la purga, que es justo
// cuando alguien pregunta quién dio de baja a quién.
// Solo lo que anotarEvento usa. Tipar el parámetro como ReturnType<typeof
// createClient> no compila: el genérico que devuelve createClient acá no es el
// mismo que el del cliente ya construido y deno check lo rechaza.
type ClienteQueEscribe = {
  from: (tabla: string) => {
    insert: (fila: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
  };
};

async function anotarEvento(
  adminClient: ClienteQueEscribe,
  accion: "eliminada" | "restaurada" | "purgada",
  destino: { id: string; email?: string | null; full_name?: string | null },
  actor: { id: string; email?: string | null },
  detalle?: Record<string, unknown>,
) {
  const { error } = await adminClient.from("cuenta_eventos").insert({
    user_id: destino.id,
    user_email: destino.email ?? null,
    user_full_name: destino.full_name ?? null,
    accion,
    actor_id: actor.id,
    actor_email: actor.email ?? null,
    detalle: detalle ?? null,
  });
  // La bitácora no puede tumbar la operación, pero que quede ruidoso en los logs:
  // una baja sin registro es exactamente el agujero que esto viene a tapar.
  if (error) console.error(`[${accion}] no pude anotar el evento:`, error.message);
}

function generateTempPassword(): string {
  // Solo letras+números (sin I/O/0/l/1 para evitar confusiones), sin
  // símbolos. Algunos clientes de email/chat re-codifican `!@#$%` o se
  // pierden en copy/paste manual (caracter invisible, autocorrect).
  // 14 chars de [A-HJ-NP-Z][a-hj-km-z][2-9] = ~83 bits de entropía,
  // suficiente para una contraseña temporal que el usuario cambia al
  // primer login.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(14);
  crypto.getRandomValues(buf);
  let result = "";
  for (let i = 0; i < 14; i++) {
    result += chars[buf[i] % chars.length];
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[admin-user-actions] Missing or malformed Authorization header");
      return new Response(JSON.stringify({ error: "Unauthorized", reason: "missing_auth_header" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await authClient.auth.getUser(token);
    if (userError || !user?.id) {
      console.error("[admin-user-actions] getUser failed:", userError?.message ?? "no user");
      return new Response(JSON.stringify({ error: "Unauthorized", reason: "invalid_token" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const callerId = user.id;
    const callerEmail = user.email ?? null;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is admin
    // Gate de ENTRADA: permiso de GESTIONAR USUARIOS, ya no el literal role='admin'.
    // La jerarquía por acción se valida abajo, rama por rama, con assertCanManage.
    const { data: canManage, error: gateErr } = await adminClient
      .rpc("can_manage_users", { _user_id: callerId });

    if (gateErr || !canManage) {
      return new Response(JSON.stringify({ error: "Forbidden: sin permiso de gestión de usuarios" }), {
        status: 403,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      action, user_id, full_name, email, first_name, last_name, role,
      ai_daily_quota_override,
      // Correo personal, fuera de Maven. Ahí van la contraseña temporal y
      // los links de recuperación: la casilla de trabajo se lee solo desde
      // adentro de Maven, así que no sirve para recuperar el acceso a Maven.
      recovery_email,
      // Casilla de trabajo a crear (ej. nombre@maven-ai.me). Si no viene,
      // no se provisiona nada.
      mailbox_email,
    } = body;

    if (!action) {
      return new Response(JSON.stringify({ error: "action is required" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // === LIST USERS (returns emails from auth.users) ===
    if (action === "list_users") {
      const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      if (listError) {
        return new Response(JSON.stringify({ error: listError.message }), {
          status: 500,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        users: (users || []).map((u) => ({ id: u.id, email: u.email })),
      }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Acciones sin persona concreta: crear una, o listar. El resto va sobre un
    // user_id. ⚠️ list_deleted_users faltaba aquí: la papelera respondía 400
    // "user_id is required" y el front lo leía como "No hay cuentas
    // eliminadas" (Jhon, 24/09), con ocho cuentas recuperables en la base.
    const SIN_USER_ID = new Set(["create_user", "list_users", "list_deleted_users"]);
    if (!SIN_USER_ID.has(action) && !user_id) {
      return new Response(JSON.stringify({ error: "user_id is required" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // === CREATE USER ===
    if (action === "create_user") {
      const gCreate = await assertCanManage(adminClient, callerId, null, "create_user", role ?? null);
      if (!gCreate.ok) {
        return new Response(JSON.stringify(gCreate.body), {
          status: gCreate.status,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
      // El APELLIDO es opcional (pedido de Jhon, 11/09/2026). Hay gente con un
      // solo nombre y hay buzones funcionales —capturados@, soporte@— que no
      // tienen apellido y obligaba a inventar uno.
      if (!first_name) {
        return new Response(JSON.stringify({ error: "first_name es requerido" }), {
          status: 400,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // === Guarda de cupos de correo (Zoho) ===
      // Si este alta va a CREAR una casilla nueva y ya no quedan puestos en
      // Zoho, frenamos ACÁ con un mensaje claro — en vez de crear un usuario a
      // medias (sin correo). Fail-open: si Zoho no responde, no bloqueamos el
      // alta (un hiccup del proveedor no puede impedir dar de alta a nadie).
      // Límite configurable con ZOHO_SEAT_LIMIT (default 10 = plan actual).
      {
        const seatLimit = Number(Deno.env.get("ZOHO_SEAT_LIMIT") ?? "10");
        const explicitMailbox = (mailbox_email as string | undefined)?.trim().toLowerCase() || "";
        // Se crea casilla cuando hay mailbox_email explícito, o cuando el login
        // se genera del nombre (sin `email`) → identidad = casilla.
        const creaCasilla = provisioningConfigured() && (!!explicitMailbox || !email);
        if (creaCasilla && seatLimit > 0) {
          const cuentas = await listAccounts();
          if (cuentas.ok && cuentas.data) {
            // Contamos solo BUZONES REALES: la cuenta super-admin de la org
            // (ej. corp@unlok.me) figura en /accounts pero SIN accountId — no
            // tiene buzón ("Crear cuenta de correo") y Zoho NO la cobra. Contarla
            // nos frenaba un buzón antes de tiempo (Maven decía 10/10 cuando Zoho
            // mostraba 9/10). Filtrar por accountId iguala el conteo al de Zoho.
            const usados = cuentas.data.filter((a) => a.accountId).length;
            const reusa = !!explicitMailbox &&
              cuentas.data.some((a) => (a.primaryEmailAddress ?? "").toLowerCase() === explicitMailbox);
            if (!reusa && usados >= seatLimit) {
              return new Response(JSON.stringify({
                error: `No quedan puestos de correo en Zoho (${usados}/${seatLimit}). Libera uno borrando un usuario de Maven —ahora eso también da de baja su casilla y libera el puesto— o desde el panel de Zoho, o amplía el plan.`,
                reason: "zoho_seats_full",
              }), { status: 409, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
            }
          }
        }
      }

      // filter(Boolean): sin apellido, un template daría "Capturados " con un
      // espacio colgando que después aparece en el Para de cada correo.
      const fullName = [first_name, last_name].filter(Boolean).join(" ");
      // Generamos un password temporal para que el usuario pueda
      // entrar al primer login sin esperar magic link. Mismo alfabeto
      // (sin símbolos) que reset_password — fácil de copy-paste.
      const tempPassword = generateTempPassword();

      // === Identidad = casilla ===
      // Cuando el alta no trae `email`, el correo de acceso SE GENERA del
      // nombre: juan.perez@<dominio>, y si está ocupado, juan.perez1@...
      // Decisión de producto de Jhon (21/08): el admin solo carga nombre,
      // apellido y rol; la contraseña temporal se entrega en mano.
      let loginEmail = (email as string | undefined)?.trim().toLowerCase() || null;
      let newUser: { user?: { id?: string } } | null = null;

      if (loginEmail) {
        const { data, error: createError } = await adminClient.auth.admin.createUser({
          email: loginEmail,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: fullName },
          // Sello de "esta alta la hizo un admin". Hoy NO lo exige nadie:
          // el guard que lo pedía en la base rompía las altas legítimas y se
          // sacó (ver migración 20260904230000). Se deja porque marca el
          // origen del alta y porque `app_metadata` sólo lo puede escribir la
          // API de admin — el registro público ignora lo que manda el
          // navegador—, así que sirve si alguna vez se rehace el candado bien
          // (con un CONSTRAINT TRIGGER diferido, y probándolo creando un
          // usuario de verdad antes de dejarlo puesto).
          app_metadata: { alta: "admin" },
        });
        if (createError) return respuestaDeAltaFallida(createError);
        newUser = data;
      } else {
        const base = direccionSugerida(first_name, last_name);
        if (!base) {
          return new Response(
            JSON.stringify({ error: "No se pudo derivar un correo de ese nombre." }),
            { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
          );
        }

        // Direcciones ya ocupadas EN EL PROVEEDOR. Importa por un caso
        // concreto: si un "Juan Pérez" se fue y entra otro, el email de
        // Maven puede estar libre pero el buzón viejo seguir existiendo —
        // adjudicárselo le mostraría al nuevo el correo del anterior. Ante
        // colisión en cualquiera de los dos lados, se prueba el siguiente
        // número.
        const ocupadasEnProveedor = new Set<string>();
        if (zohoConfigured()) {
          const cuentas = await listAccounts();
          for (const a of cuentas.data ?? []) {
            if (a.primaryEmailAddress) ocupadasEnProveedor.add(a.primaryEmailAddress.toLowerCase());
          }
        }

        let ultimoError: { message?: string } | null = null;
        for (let n = 0; n < 50 && !newUser; n++) {
          const candidato = `${base}${n === 0 ? "" : n}@${DOMINIO_CASILLA}`;
          if (ocupadasEnProveedor.has(candidato)) continue;
          const { data, error: createError } = await adminClient.auth.admin.createUser({
            email: candidato,
            password: tempPassword,
            email_confirm: true,
            user_metadata: { full_name: fullName },
            // El mismo sello que arriba (informativo, ver comentario).
            app_metadata: { alta: "admin" },
          });
          if (!createError) {
            newUser = data;
            loginEmail = candidato;
            break;
          }
          // Ocupado en Maven: probamos el siguiente número. Cualquier otro
          // error corta — repetirlo 50 veces no lo va a arreglar.
          if (!/already (been )?registered|already exists|duplicate/i.test(createError.message ?? "")) {
            return respuestaDeAltaFallida(createError);
          }
          ultimoError = createError;
        }
        if (!newUser || !loginEmail) {
          return respuestaDeAltaFallida(
            ultimoError ?? { message: "no quedó ningún candidato libre para ese nombre" },
          );
        }
      }

      // deno-lint-ignore no-inner-declarations
      function respuestaDeAltaFallida(createError: { message?: string }) {
        // Mapeamos los errores comunes a español para que el modal del
        // admin muestre algo accionable. createUser de Supabase Auth
        // devuelve mensajes como "A user with this email address has
        // already been registered" o "Email rate limit exceeded".
        const raw = createError.message ?? "";
        let friendly = raw;
        if (/already (been )?registered|already exists|duplicate/i.test(raw)) {
          friendly = "Ya existe un usuario con ese email.";
        } else if (/invalid email/i.test(raw)) {
          friendly = "Email inválido.";
        } else if (/rate limit/i.test(raw)) {
          friendly = "Demasiados intentos seguidos, espera un minuto y vuelve a intentar.";
        } else if (/database error/i.test(raw)) {
          // Así envuelve GoTrue CUALQUIER error de la base al crear el
          // usuario, y el texto crudo no le dice nada a quien está dando el
          // alta. Pasó de verdad: un trigger nuestro en auth.users rechazaba
          // todas las altas y en pantalla se leía "Database error creating
          // new user", en inglés. El detalle técnico viaja en `raw`.
          friendly = "La base rechazó el alta. No es algo que puedas arreglar desde aquí: avísale al equipo técnico con la hora exacta.";
        } else if (raw && !/[áéíóúñ¿¡]/i.test(raw)) {
          // Cualquier otro mensaje del servidor de auth viene en inglés. Que
          // no llegue crudo a la pantalla: el detalle queda en `raw` para
          // depurar.
          friendly = "No se pudo crear el usuario.";
        }
        return new Response(JSON.stringify({ error: friendly, raw }), {
          status: 400,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      if (role && role !== "employee" && newUser?.user?.id) {
        await adminClient
          .from("user_roles")
          .update({ role })
          .eq("user_id", newUser.user.id);
      }

      // Tenant membership: el usuario nuevo hereda el tenant del admin
      // que lo creó. Sin esta fila, current_tenant_id() devuelve NULL
      // y RLS le filtra TODA la data tenant-scoped a 0 (ese era el bug
      // que vimos cuando un admin recién creado entraba a Scouter Assist
      // y veía 0 leads). ON CONFLICT DO NOTHING por si una migration o
      // trigger ya creó la fila.
      if (newUser?.user?.id) {
        const { data: callerMembership } = await adminClient
          .from("tenant_members")
          .select("tenant_id")
          .eq("user_id", callerId)
          .maybeSingle();

        const callerTenantId = (callerMembership as { tenant_id?: string } | null)?.tenant_id;
        if (callerTenantId) {
          const { error: tmErr } = await adminClient
            .from("tenant_members")
            .upsert(
              { user_id: newUser.user.id, tenant_id: callerTenantId },
              { onConflict: "user_id,tenant_id", ignoreDuplicates: true },
            );
          if (tmErr) {
            console.error(
              "[admin-user-actions] tenant_members insert failed:",
              tmErr.message,
            );
          }
        } else {
          console.warn(
            "[admin-user-actions] caller has no tenant_members row — new user created without tenant",
          );
        }
      }

      // === Correo personal de recuperación ===
      // Va antes que todo lo demás porque de esto depende que la persona
      // pueda recibir su contraseña temporal.
      let recoveryStored = false;
      if (recovery_email && newUser?.user?.id) {
        const { error: recErr } = await adminClient
          .from("user_recovery_emails")
          .upsert(
            { user_id: newUser.user.id, recovery_email: String(recovery_email).trim().toLowerCase() },
            { onConflict: "user_id" },
          );
        if (recErr) {
          console.error("[create_user] no se pudo guardar el correo de recuperación:", recErr.message);
        } else {
          recoveryStored = true;
        }
      }

      // === Casilla de correo de trabajo ===
      // MEJOR ESFUERZO A PROPÓSITO: crear usuarios es camino crítico. Si
      // el proveedor de correo está caído o sin configurar, el alta tiene
      // que terminar igual — la casilla se repara después reintentando,
      // que es idempotente. Lo que NO puede pasar es que un admin no
      // pueda dar de alta a nadie porque un servicio de terceros falla.
      let mailboxResult: ProvisionResult | null = null;
      // La casilla por defecto ES el correo de acceso: identidad = casilla.
      // `mailbox_email` explícito se respeta (compatibilidad con el flujo
      // viejo por API); solo si viene vacío Y el login se generó del
      // nombre, la casilla es esa misma dirección.
      const casillaFinal =
        (mailbox_email as string | undefined)?.trim().toLowerCase() ||
        (!email ? loginEmail : null);
      if (casillaFinal && newUser?.user?.id) {
        try {
          mailboxResult = await provisionMailbox({
            adminClient,
            userId: newUser.user.id,
            email: casillaFinal,
            firstName: first_name,
            lastName: last_name,
          });
          if (!mailboxResult.ok) {
            console.error("[create_user] provisión de casilla falló:", mailboxResult.error);
          }
        } catch (e) {
          const msg = (e as Error).message ?? "error inesperado";
          console.error("[create_user] provisión de casilla explotó:", msg);
          mailboxResult = {
            ok: false, email_address: casillaFinal, outcome: null, error: msg,
          };
        }
      }

      // Email de bienvenida con el password temporal vía Resend.
      // ANTES estaba en EdgeRuntime.waitUntil para no bloquear la
      // respuesta, pero los logs mostraban que el isolate moría antes
      // de que el fetch a Resend completara — los emails nunca salían.
      // Pasamos a await sincrónico: 1-2s extra de latencia en el modal
      // a cambio de garantía de delivery. Crear cuenta es una acción
      // poco frecuente, esa latencia es aceptable.
      const welcomeTo = recoveryStored
        ? String(recovery_email).trim().toLowerCase()
        : loginEmail!;

      // Si el destino es la casilla que acabamos de crear, NO se manda:
      // la persona necesita la contraseña para abrirla — mandársela ahí es
      // el círculo vicioso. La contraseña temporal viaja en la RESPUESTA y
      // el admin la entrega en mano (decisión de Jhon: el reset también es
      // por admin).
      const entregaEnMano = !recoveryStored &&
        !!casillaFinal && welcomeTo.toLowerCase() === casillaFinal;

      const resendKey = Deno.env.get("RESEND_API_KEY");
      let emailSent = false;
      let emailError: string | null = null;

      if (entregaEnMano) {
        // A propósito: ver arriba. emailSent queda en false sin error.
      } else if (!resendKey) {
        emailError = "RESEND_API_KEY no configurada";
      } else {
        try {
          // Si el env var viene pelado (sin display name), le anteponemos
          // "Maven CRM" para que Gmail muestre el nombre y no "noreply".
          const rawFrom =
            Deno.env.get("NOTIFICATION_FROM_EMAIL") || "noreply@mail.maven-ai.me";
          const fromEmail = rawFrom.includes("<") ? rawFrom : `Maven CRM <${rawFrom}>`;
          const appUrl = Deno.env.get("APP_URL") || "https://maven.asmtech.ai";

          const html = `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
              <div style="background:linear-gradient(135deg,#6d28d9,#4338ca);padding:28px 24px;color:#ffffff;">
                <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;opacity:0.85;text-transform:uppercase;">Maven CRM</div>
                <h1 style="font-size:22px;font-weight:700;margin:6px 0 0;line-height:1.3;">Bienvenido/a a Maven</h1>
              </div>
              <div style="padding:24px;">
                <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px;">
                  Hola <strong>${fullName}</strong>,
                  se creó tu cuenta en Maven CRM. Esta es tu contraseña
                  temporal para iniciar sesión:
                </p>
                <div style="margin:18px 0;padding:14px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;text-align:center;">
                  <code style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:18px;font-weight:700;letter-spacing:2px;color:#111827;">${tempPassword}</code>
                </div>
                <p style="color:#6b7280;font-size:13px;line-height:1.55;margin:0 0 16px;">
                  Inicia sesión con tu correo (<strong>${loginEmail}</strong>)
                  y esta contraseña, después cámbiala desde
                  Settings → Cuenta. Si no esperabas este correo,
                  ignóralo o avísale al admin.
                </p>
                <div style="text-align:center;margin:20px 0 0;">
                  <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#6d28d9,#4338ca);color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:9999px;">
                    Entrar a Maven →
                  </a>
                </div>
              </div>
              <div style="background:#f9fafb;padding:14px 24px;text-align:center;border-top:1px solid #e5e7eb;">
                <p style="color:#9ca3af;font-size:11px;margin:0;">Enviado por Maven CRM · No respondas a este correo.</p>
              </div>
            </div>
          `;

          const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: fromEmail,
              // Al correo personal si lo hay. Si la direccion de login es
              // la casilla interna, mandarle ahi la contrasena temporal es
              // pedirle que entre para poder entrar.
              to: [welcomeTo],
              subject: "Maven CRM · Bienvenido/a — tu contraseña temporal",
              html,
            }),
          });
          if (resp.ok) {
            emailSent = true;
          } else {
            const body = await resp.text().catch(() => "");
            emailError = `Resend ${resp.status}: ${body.slice(0, 200)}`;
            console.error("[create_user] Resend failed", emailError);
          }
        } catch (e) {
          emailError = (e as Error).message ?? "fetch failed";
          console.error("[create_user] email exception", e);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          user_id: newUser?.user?.id,
          // El correo con el que la persona entra a Maven. Cuando se generó
          // del nombre, el admin lo ve por primera vez ACÁ.
          email: loginEmail,
          temp_password: tempPassword,
          // true = la contraseña no viajó por correo: el admin la entrega.
          hand_delivery: entregaEnMano,
          email_sent: emailSent,
          email_error: emailError,
          email_sent_to: entregaEnMano ? null : welcomeTo,
          recovery_email_stored: recoveryStored,
          // El admin tiene que ver si la casilla quedo o no: el alta
          // termina bien igual, y sin esto el fallo pasa desapercibido.
          mailbox: mailboxResult,
        }),
        { headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // === MIGRATE EMAIL (cambiar dominio del login + provisionar buzón) ===
    // Pasa una cuenta de, ej., @unlok.me a @maven-ai.me SIN borrar/recrear: mantiene
    // el MISMO user_id → todo lo linkeado por id queda intacto. Y si se conserva el
    // LOCAL (juan.perez@unlok.me → juan.perez@maven-ai.me), la `chatter_identity`
    // (indexada por email_local) y sus vínculos de Hubstaff/BLU se preservan. Además
    // provisiona el buzón Zoho en la nueva dirección. `email` = la NUEVA dirección.
    if (action === "migrate_email") {
      // Self-servicio permitido: cambiar el PROPIO correo de login + buzón es
      // benigno (mismo user_id y contraseña), a diferencia de borrar/degradar.
      // El gate de arriba (can_manage_users) ya asegura que quien llama es admin;
      // para OTRAS cuentas se aplica la jerarquía normal.
      if (String(user_id) !== callerId) {
        const gMig = await assertCanManage(adminClient, callerId, user_id, "delete_user");
        if (!gMig.ok) {
          return new Response(JSON.stringify(gMig.body), {
            status: gMig.status,
            headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          });
        }
      }
      const nuevo = (email as string | undefined)?.trim().toLowerCase();
      if (!nuevo) {
        return new Response(JSON.stringify({ error: "email (la nueva dirección) es requerido" }), {
          status: 400,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Nombre para el display de la casilla.
      const { data: prof } = await adminClient
        .from("profiles").select("full_name").eq("id", user_id).maybeSingle();
      const partes = String((prof as { full_name?: string } | null)?.full_name || "Usuario Maven")
        .trim().split(/\s+/);
      const first = partes[0] || "Usuario";
      const last = partes.slice(1).join(" ") || "Maven";

      // 0) ¿La dirección ya es de otra cuenta? gotrue responde "Error updating
      //    user" a secas, que no le dice nada a quien lo está usando. Caso real:
      //    John Idrobo tenía DOS cuentas (una vieja con el @maven-ai.me y otra
      //    nueva con el @unlok.me) y el destino estaba ocupado por la suya vieja.
      //    Avisamos con nombre y propuesta en vez del error opaco.
      const { data: duenoRaw } = await adminClient.rpc("auth_user_by_email", { _email: nuevo });
      const dueno = (duenoRaw as { user_id: string; full_name: string }[] | null)?.[0];
      if (dueno && dueno.user_id !== user_id) {
        return new Response(JSON.stringify({
          error: `La dirección ${nuevo} ya la usa otra cuenta de Maven (${dueno.full_name}). ` +
            `Si son la misma persona con cuenta duplicada, hay que decidir cuál se queda: ` +
            `la que ya tiene esa dirección conserva su casilla, su historial y sus vínculos.`,
          reason: "email_ya_en_uso",
          owner_user_id: dueno.user_id,
          owner_name: dueno.full_name,
        }), {
          status: 409,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // 1) Cambiar el email de LOGIN (gotrue). email_confirm:true → sin mail de verificación.
      const { error: mailErr } = await adminClient.auth.admin.updateUserById(user_id as string, {
        email: nuevo,
        email_confirm: true,
      });
      if (mailErr) {
        return new Response(JSON.stringify({ error: `no pude cambiar el email de login: ${mailErr.message}` }), {
          status: 400,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // 2) Provisionar el buzón Zoho en la nueva dirección (crea + guarda credencial cifrada).
      const mailboxResult = await provisionMailbox({
        adminClient,
        userId: user_id as string,
        email: nuevo,
        firstName: first,
        lastName: last,
      });

      return new Response(JSON.stringify({ success: true, email: nuevo, mailbox: mailboxResult }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Prevent self-destructive actions
    if (action === "delete_user" && user_id === callerId) {
      return new Response(JSON.stringify({ error: "No puedes eliminarte a ti mismo" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (action === "reset_password") {
      const gReset = await assertCanManage(adminClient, callerId, user_id, "reset_password");
      if (!gReset.ok) {
        return new Response(JSON.stringify(gReset.body), {
          status: gReset.status,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const tempPassword = generateTempPassword();

      const { error: resetError } = await adminClient.auth.admin.updateUserById(user_id, {
        password: tempPassword,
      });

      if (resetError) {
        return new Response(JSON.stringify({ error: resetError.message }), {
          status: 500,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // El email viaja en background (Resend tarda 1-3s y no queremos
      // bloquear la respuesta del modal). Devolvemos email_sent=true
      // optimistamente cuando hay key configurada — si Resend falla
      // queda en los logs del edge function. Si la key falta, sí
      // bloqueamos amber para que el admin sepa que tiene que
      // comunicar el password a mano.
      // Email vía Resend con await directo. Antes intenté con
      // EdgeRuntime.waitUntil (más rápido en el modal) pero el isolate
      // a veces se shutdown antes que el fetch complete y el correo no
      // sale. Mejor pagar 1-2s extra de latencia y garantizar delivery.
      const resendKey = Deno.env.get("RESEND_API_KEY");
      let emailSent = false;
      let emailError: string | null = null;

      if (!resendKey) {
        emailError = "RESEND_API_KEY no configurada";
      } else {
        try {
          const { data: targetUser } = await adminClient.auth.admin.getUserById(user_id);
          const targetEmail = targetUser?.user?.email;
          if (!targetEmail) {
            emailError = "Usuario sin email registrado";
          } else {
            const { data: profile } = await adminClient
              .from("profiles")
              .select("full_name")
              .eq("id", user_id)
              .maybeSingle();
            const fullName = (profile as { full_name?: string } | null)?.full_name ?? "";
            const rawFrom =
              Deno.env.get("NOTIFICATION_FROM_EMAIL") || "noreply@mail.maven-ai.me";
            const fromEmail = rawFrom.includes("<") ? rawFrom : `Maven CRM <${rawFrom}>`;
            const appUrl = Deno.env.get("APP_URL") || "https://maven.asmtech.ai";

            const html = `
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
                <div style="background:linear-gradient(135deg,#6d28d9,#4338ca);padding:28px 24px;color:#ffffff;">
                  <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;opacity:0.85;text-transform:uppercase;">Maven CRM</div>
                  <h1 style="font-size:22px;font-weight:700;margin:6px 0 0;line-height:1.3;">Tu contraseña fue restablecida</h1>
                </div>
                <div style="padding:24px;">
                  <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px;">
                    ${fullName ? `Hola <strong>${fullName}</strong>,` : "Hola,"}
                    un administrador de Maven restableció tu contraseña.
                    Esta es tu nueva contraseña temporal:
                  </p>
                  <div style="margin:18px 0;padding:14px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;text-align:center;">
                    <code style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:18px;font-weight:700;letter-spacing:2px;color:#111827;">${tempPassword}</code>
                  </div>
                  <p style="color:#6b7280;font-size:13px;line-height:1.55;margin:0 0 16px;">
                    Inicia sesión con esta contraseña y cámbiala inmediatamente
                    desde Settings → Cuenta. Si tú no pediste este reset,
                    avísale al admin lo antes posible.
                  </p>
                  <div style="text-align:center;margin:20px 0 0;">
                    <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#6d28d9,#4338ca);color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:9999px;">
                      Entrar a Maven →
                    </a>
                  </div>
                </div>
                <div style="background:#f9fafb;padding:14px 24px;text-align:center;border-top:1px solid #e5e7eb;">
                  <p style="color:#9ca3af;font-size:11px;margin:0;">Enviado por Maven CRM · No respondas a este correo.</p>
                </div>
              </div>
            `;

            const resp = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: fromEmail,
                to: [targetEmail],
                subject: "Maven CRM · Tu contraseña fue restablecida",
                html,
              }),
            });
            if (resp.ok) {
              emailSent = true;
            } else {
              const body = await resp.text().catch(() => "");
              emailError = `Resend ${resp.status}: ${body.slice(0, 200)}`;
              console.error("[reset_password] Resend failed", emailError);
            }
          }
        } catch (e) {
          emailError = (e as Error).message ?? "fetch failed";
          console.error("[reset_password] email exception", e);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          temp_password: tempPassword,
          email_sent: emailSent,
          email_error: emailError,
        }),
        { headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    if (action === "remove_role") {
      const gRemove = await assertCanManage(adminClient, callerId, user_id, "remove_role");
      if (!gRemove.ok) {
        return new Response(JSON.stringify(gRemove.body), {
          status: gRemove.status,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (user_id === callerId) {
        return new Response(JSON.stringify({ error: "No puedes quitarte tu propio rol" }), {
          status: 400,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const { error: removeError } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", user_id);

      if (removeError) {
        return new Response(JSON.stringify({ error: removeError.message }), {
          status: 500,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // === ELIMINAR (suspender): la cuenta se va a la papelera 30 días ===
    // No se borra NADA. Se le cierra la sesión, se le bloquea la entrada y se
    // marca el perfil. Lo único irreversible es la casilla de Zoho, que se da de
    // baja para liberar el puesto del plan — decisión tomada a sabiendas: al
    // restaurar, el buzón vuelve a crearse vacío.
    if (action === "delete_user") {
      const gDelete = await assertCanManage(adminClient, callerId, user_id, "delete_user");
      if (!gDelete.ok) {
        return new Response(JSON.stringify(gDelete.body), {
          status: gDelete.status,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
      console.log(`[delete_user] suspendiendo user_id=${user_id}`);

      const { data: auDel } = await adminClient.auth.admin.getUserById(user_id);
      const { data: perfilDel } = await adminClient
        .from("profiles").select("full_name, deleted_at").eq("id", user_id).maybeSingle();

      if ((perfilDel as { deleted_at?: string } | null)?.deleted_at) {
        return new Response(JSON.stringify({ error: "Esa cuenta ya está en la papelera" }), {
          status: 409,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Antes de purgar (app_purge_user_refs borra mail_credentials): averiguar
      // la casilla Zoho de este usuario para darla de baja y LIBERAR el puesto.
      let zohoMailbox: string | null = null;
      try {
        const { data: cred } = await adminClient
          .from("mail_credentials")
          .select("email_address")
          .eq("user_id", user_id)
          .maybeSingle();
        zohoMailbox = (cred as { email_address?: string } | null)?.email_address ?? null;
        // Fallback: si no hay fila en mail_credentials (buzón creado fuera del flujo
        // de Maven o credencial nunca guardada — el caso de brenda), usamos el email
        // de LOGIN: para los @maven-ai.me la identidad ES la casilla. liberarPuestoZoho
        // solo borra si ese email matchea una cuenta REAL en Zoho, así que un usuario
        // con correo externo no se ve afectado.
        if (!zohoMailbox) {
          const { data: au } = await adminClient.auth.admin.getUserById(user_id);
          zohoMailbox = (au?.user?.email as string | undefined) ?? null;
        }
      } catch { /* noop */ }

      // Da de baja (ELIMINA) la casilla en Zoho para liberar el puesto. Best-effort
      // y se llama recién con el usuario ya borrado OK: si el borrado falla, no
      // dejamos una casilla huérfana. deleteMailbox es irreversible (borra el
      // buzón) — que es justo lo que libera el cupo del plan.
      const liberarPuestoZoho = async (): Promise<string | null> => {
        if (!zohoMailbox || !zohoConfigured()) return null;
        try {
          // Confirmamos que ese email existe como cuenta en Zoho (así un usuario
          // con correo EXTERNO no dispara nada). Después borramos POR EMAIL.
          const cuentas = await listAccounts();
          const existe = (cuentas.data ?? []).some(
            (a) => (a.primaryEmailAddress ?? "").toLowerCase() === zohoMailbox!.toLowerCase(),
          );
          if (!existe) return null;
          const del = await deleteMailbox(zohoMailbox);
          if (!del.ok) { console.error("[delete_user] no pude borrar la casilla Zoho:", del.error); return null; }
          console.log(`[delete_user] casilla Zoho liberada: ${zohoMailbox}`);
          return zohoMailbox;
        } catch (e) {
          console.error("[delete_user] baja de casilla explotó:", (e as Error).message);
          return null;
        }
      };


      // 1. Fuera de la sesión YA. Banear frena el refresh del token, pero el
      // access token que ya tiene en el navegador le sirve hasta que vence.
      const { error: revErr } = await adminClient.rpc("app_revoke_user_sessions", {
        p_user_id: user_id,
      });
      if (revErr) console.error("[delete_user] no pude cerrar sesiones:", revErr.message);

      // 2. Bloquear la entrada. 100 años ~ para siempre; restaurar lo quita.
      const { error: banErr } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: "876000h",
      });
      if (banErr) {
        return new Response(JSON.stringify({ error: `No pude bloquear la cuenta: ${banErr.message}` }), {
          status: 500,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // 3. Marcar el perfil. Esto es lo que la esconde de los listados.
      const { error: markErr } = await adminClient
        .from("profiles")
        .update({ deleted_at: new Date().toISOString(), deleted_by: callerId })
        .eq("id", user_id)
        .select("id");
      if (markErr) {
        // Revertimos el baneo: una cuenta bloqueada que sigue apareciendo como
        // activa es el peor de los dos mundos.
        await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "none" });
        return new Response(JSON.stringify({ error: `No pude marcar la baja: ${markErr.message}` }), {
          status: 500,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // 4. Liberar el puesto de Zoho (irreversible, best-effort).
      const mbRemoved = await liberarPuestoZoho();

      // 5. Con la casilla dada de baja, la credencial guardada quedó muerta: si
      // se deja, el worker de correo sigue intentando sincronizar un buzón que
      // ya no existe. Los mensajes ya cacheados NO se tocan.
      if (mbRemoved) {
        await adminClient.from("mail_credentials").delete().eq("user_id", user_id);
        await adminClient.from("mail_sync_state").delete().eq("user_id", user_id);
      }

      await anotarEvento(adminClient, "eliminada",
        { id: user_id, email: auDel?.user?.email ?? null, full_name: (perfilDel as { full_name?: string } | null)?.full_name ?? null },
        { id: callerId, email: callerEmail },
        { casilla_zoho_liberada: mbRemoved, dias_de_papelera: DIAS_DE_PAPELERA });

      console.log(`[delete_user] suspendida user_id=${user_id}, recuperable ${DIAS_DE_PAPELERA} días`);
      return new Response(JSON.stringify({
        success: true,
        mailbox_removed: mbRemoved,
        recuperable_hasta_dias: DIAS_DE_PAPELERA,
      }), { headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
    }

    // === RESTAURAR: sacar de la papelera ===
    // Mismo permiso que eliminar. No devuelve la casilla de correo.
    if (action === "restore_user") {
      const gRestore = await assertCanManage(adminClient, callerId, user_id, "delete_user");
      if (!gRestore.ok) {
        return new Response(JSON.stringify(gRestore.body), {
          status: gRestore.status,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const { data: perfilRes } = await adminClient
        .from("profiles").select("full_name, deleted_at").eq("id", user_id).maybeSingle();
      const marcado = perfilRes as { full_name?: string; deleted_at?: string } | null;
      if (!marcado) {
        return new Response(JSON.stringify({ error: "Esa cuenta ya fue purgada: no se puede recuperar" }), {
          status: 410,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (!marcado.deleted_at) {
        return new Response(JSON.stringify({ error: "Esa cuenta no está en la papelera" }), {
          status: 409,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const { error: unbanErr } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: "none",
      });
      if (unbanErr) {
        return new Response(JSON.stringify({ error: `No pude desbloquear la cuenta: ${unbanErr.message}` }), {
          status: 500,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const { error: clearErr } = await adminClient
        .from("profiles")
        .update({ deleted_at: null, deleted_by: null })
        .eq("id", user_id)
        .select("id");
      if (clearErr) {
        await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "876000h" });
        return new Response(JSON.stringify({ error: `No pude limpiar la marca de baja: ${clearErr.message}` }), {
          status: 500,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const { data: auRes } = await adminClient.auth.admin.getUserById(user_id);
      await anotarEvento(adminClient, "restaurada",
        { id: user_id, email: auRes?.user?.email ?? null, full_name: marcado.full_name ?? null },
        { id: callerId, email: callerEmail },
        { eliminada_el: marcado.deleted_at });

      console.log(`[restore_user] recuperada user_id=${user_id}`);
      return new Response(JSON.stringify({
        success: true,
        // La casilla de Zoho no vuelve: se dio de baja al eliminar para liberar
        // el puesto. Hay que crearla de nuevo si esta persona necesita correo.
        mailbox_restored: false,
      }), { headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
    }

    // === PAPELERA: qué hay y cuánto le queda ===
    if (action === "list_deleted_users") {
      const { data: enPapelera, error: papErr } = await adminClient
        .from("profiles")
        .select("id, full_name, avatar_url, avatar_seed, deleted_at, deleted_by")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (papErr) {
        return new Response(JSON.stringify({ error: papErr.message }), {
          status: 500,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const filas = (enPapelera ?? []) as {
        id: string; full_name: string | null; avatar_url: string | null;
        avatar_seed: string | null; deleted_at: string; deleted_by: string | null;
      }[];

      // Nombre de quien la dio de baja, para no mostrar un uuid en pantalla.
      const idsActores = [...new Set(filas.map((f) => f.deleted_by).filter(Boolean))] as string[];
      const nombreDelActor = new Map<string, string>();
      if (idsActores.length) {
        const { data: actores } = await adminClient
          .from("profiles").select("id, full_name").in("id", idsActores);
        for (const a of (actores ?? []) as { id: string; full_name: string | null }[]) {
          if (a.full_name) nombreDelActor.set(a.id, a.full_name);
        }
      }

      const ahora = Date.now();
      return new Response(JSON.stringify({
        dias_de_papelera: DIAS_DE_PAPELERA,
        users: await Promise.all(filas.map(async (f) => {
          const { data: au } = await adminClient.auth.admin.getUserById(f.id);
          const transcurridos = (ahora - new Date(f.deleted_at).getTime()) / 86_400_000;
          return {
            id: f.id,
            full_name: f.full_name,
            avatar_url: f.avatar_url,
            avatar_seed: f.avatar_seed,
            email: au?.user?.email ?? "",
            deleted_at: f.deleted_at,
            deleted_by: f.deleted_by,
            deleted_by_name: f.deleted_by ? nombreDelActor.get(f.deleted_by) ?? null : null,
            // Puede dar 0: es una cuenta que el cron va a purgar en el próximo pase.
            dias_restantes: Math.max(0, Math.ceil(DIAS_DE_PAPELERA - transcurridos)),
          };
        })),
      }), { headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
    }

    // === PURGAR: el borrado destructivo de siempre, ahora solo-admin ===
    // Esto es lo que corría antes con cada "eliminar". Se lleva los roles, el
    // correo, las horas de Cowork, los espacios que la persona creó, y deja sin
    // autor ~50 columnas created_by/assigned_to por todo el CRM. Irreversible.
    // Exige que la cuenta ya esté en la papelera: nadie destruye de un clic.
    if (action === "purge_user") {
      const { data: esAdmin } = await adminClient.rpc("has_role", {
        _user_id: callerId,
        _role: "admin",
      });
      if (!esAdmin) {
        return new Response(JSON.stringify({ error: "Solo un admin puede purgar una cuenta" }), {
          status: 403,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const { data: perfilPur } = await adminClient
        .from("profiles").select("full_name, deleted_at").eq("id", user_id).maybeSingle();
      const aPurgar = perfilPur as { full_name?: string; deleted_at?: string } | null;
      if (!aPurgar?.deleted_at) {
        return new Response(JSON.stringify({
          error: "Primero hay que eliminar la cuenta: la purga solo aplica a lo que está en la papelera",
        }), { status: 409, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
      }

      console.log(`[purge_user] purgando for user_id=${user_id}`);
      const { data: auPur } = await adminClient.auth.admin.getUserById(user_id);

      // La constancia va ANTES de destruir: después no queda de dónde copiar el
      // nombre ni el correo.
      await anotarEvento(adminClient, "purgada",
        { id: user_id, email: auPur?.user?.email ?? null, full_name: aPurgar.full_name ?? null },
        { id: callerId, email: callerEmail },
        { eliminada_el: aPurgar.deleted_at });

      // 1. Limpia TODAS las refs en public.* a este user_id usando la
      // función SQL app_purge_user_refs. Antes esto era una lista
      // hardcoded de 6 tablas (employees, project_members,
      // chat_participants, user_roles, notifications, profiles), pero
      // hay 49 FKs a auth.users en public — las 43 restantes hacían
      // que auth.deleteUser fallara con "Database error deleting user"
      // y el frontend mostraba el delete como exitoso (porque el
      // profile sí se borraba) dejando huérfanos en auth.users que
      // bloqueaban recrear el usuario con el mismo email.
      const { error: purgeErr } = await adminClient.rpc("app_purge_user_refs", {
        p_user_id: user_id,
      });
      if (purgeErr) {
        console.error("[purge_user] app_purge_user_refs failed:", purgeErr.message);
        return new Response(
          JSON.stringify({ error: `Error limpiando datos del usuario: ${purgeErr.message}` }),
          {
            status: 500,
            headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          },
        );
      }

      // 2. Delete auth user. Si esto falla (FK rara, lock, etc.) NO
      // devolvemos éxito — el frontend tiene que ver el error para
      // que el admin no asuma que el usuario quedó borrado.
      //
      // Fallback: gotrue.deleteUser surfacea "Database error deleting
      // user" genérico que oculta el error PG real (FK violation,
      // trigger fail, etc.). Si falla, intentamos un DELETE directo
      // a auth.users con el service role — eso sí devuelve el FK
      // violation específico para diagnosticar y arreglar el purge.
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id);
      if (deleteError) {
        console.error(
          "[purge_user] gotrue deleteUser failed:",
          JSON.stringify({
            message: deleteError.message,
            status: (deleteError as { status?: number }).status,
            code: (deleteError as { code?: string }).code,
            name: deleteError.name,
          }),
        );
        // Probar DELETE directo para obtener el FK violation real
        let pgErrorDetail: string | null = null;
        try {
          const { error: pgErr } = await adminClient.rpc("app_force_delete_auth_user", {
            p_user_id: user_id,
          });
          if (pgErr) {
            pgErrorDetail = pgErr.message;
            console.error("[purge_user] direct delete also failed:", pgErr.message);
          } else {
            // El DELETE directo funcionó — gotrue habrá fallado por
            // razones de su propio side (sesiones colgadas, etc.).
            console.log(`[purge_user] purgada por DELETE directo user_id=${user_id}`);
            // La casilla de Zoho ya se dio de baja cuando se eliminó la cuenta.
            return new Response(JSON.stringify({ success: true, purged: true }), {
              headers: { ...corsHeaders(req), "Content-Type": "application/json" },
            });
          }
        } catch (e) {
          console.warn(
            "[purge_user] app_force_delete_auth_user RPC not available:",
            (e as Error).message,
          );
        }
        return new Response(
          JSON.stringify({
            error: `Error eliminando usuario: ${deleteError.message}`,
            detail: pgErrorDetail,
          }),
          {
            status: 500,
            headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          },
        );
      }

      console.log(`[purge_user] purgada user_id=${user_id}`);
      return new Response(JSON.stringify({ success: true, purged: true }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (action === "update_profile") {
      const gUpdate = await assertCanManage(adminClient, callerId, user_id, "update_profile", role ?? null);
      if (!gUpdate.ok) {
        return new Response(JSON.stringify(gUpdate.body), {
          status: gUpdate.status,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const newFullName = first_name
        ? [first_name, last_name].filter(Boolean).join(" ")
        : full_name;

      if (!newFullName) {
        return new Response(JSON.stringify({ error: "full_name or first_name+last_name is required" }), {
          status: 400,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const profilePatch: Record<string, unknown> = { full_name: newFullName };
      if (ai_daily_quota_override !== undefined) profilePatch.ai_daily_quota_override = ai_daily_quota_override;
      const { error: updateError } = await adminClient
        .from("profiles")
        .update(profilePatch)
        .eq("id", user_id);

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      if (role) {
        // Este camino escribía el rol SIN validarlo contra roles_config (el otro
        // endpoint sí lo hace). Se valida igual acá: si no existe o está inactivo,
        // no se escribe. La jerarquía ya la chequeó gUpdate arriba.
        const { data: validRoleUp } = await adminClient
          .from("roles_config")
          .select("id")
          .eq("name", role)
          .eq("is_active", true)
          .maybeSingle();

        if (!validRoleUp) {
          return new Response(JSON.stringify({ error: `Rol inválido o inactivo: ${role}` }), {
            status: 400,
            headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const { error: roleError } = await adminClient
          .from("user_roles")
          .update({ role })
          .eq("user_id", user_id);

        if (roleError) {
          return new Response(JSON.stringify({ error: roleError.message }), {
            status: 500,
            headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("[admin-user-actions] Internal error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
