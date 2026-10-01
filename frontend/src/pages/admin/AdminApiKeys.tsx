import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound, Plus, Check, Loader2, ShieldAlert, Trash2, Pencil, BookOpen, ExternalLink, X, MessageSquareX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { adminInvoke } from "@/lib/adminInvoke";
import { PageHeader } from "@/components/ui/page-header";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { ConFormato, CopyButton, Persona } from "./apiKeysPiezas";
import { useCaras } from "./carasDePersonas";
import { CeldaWebhook, DialogoWebhook, DocsWebhooks, type WebhookResumen } from "./ApiKeyWebhook";
import { AvisoVersionesViejas, DialogoRetirada } from "./ApiKeyEscritura";
import {
  SCOPE_MESSENGER_ESCRITURA, alternarScope, esScopeDeEscritura, esScopeMessenger, escribe,
  normalizarNombreVisible, problemaDelNombreVisible, type ProblemaDelNombre,
} from "./apiKeysEscritura";

// Settings → Administración → API keys (SOLO admins).
// Gestión de la API pública de Maven, estilo Infloww: tabla + modal agrupado por
// entidad (Creadoras / Empleados / Ventas), IP whitelist, expiración y hasta 3
// keys activas. El secreto se muestra UNA sola vez al crear.

type ScopeDef = { key: string; group: string; label: string; description: string };
type ApiKey = {
  id: string; name: string; key_prefix: string; last_four: string | null;
  scopes: string[]; ip_whitelist: string[];
  created_at: string; created_by_email: string | null;
  last_used_at: string | null; request_count: number;
  expires_at: string | null; revoked_at: string | null;
  status: "active" | "revoked" | "expired";
  // Como quién actúa la key: fija desde que se crea (quien la crea). Opcionales
  // mientras convivan el front nuevo y un manage-api-keys anterior.
  acts_as?: { id: string; name: string | null; active: boolean | null } | null;
  limite_por_hora?: number;
  /** Su webhook del Messenger (a lo sumo uno). null = no tiene; undefined = el
   *  servidor no lo mandó (se trata como "no se sabe"). */
  webhook?: WebhookResumen | null;
  /** messenger:write: el nombre con el que salen sus mensajes («BLU»). Es un DATO: no
   *  se traduce. Y la integración (la comparten las keys de una rotación). */
  api_display_name?: string | null;
  integracion_id?: string;
};
type ListResp = {
  keys: ApiKey[]; scope_catalog: ScopeDef[]; scope_groups: string[]; max_active_keys: number;
  /** Quién está mirando: una key nueva actúa como esta persona. */
  you?: { id: string; name: string | null };
  /** true = no se pudo consultar los webhooks: la tabla no ofrece Registrar. */
  webhooks_unknown?: boolean;
};

// Los del Messenger (leer y escribir) van con IPs exactas, vencimiento de 90 días como
// máximo y solo en keys nuevas (decisión del 25/09; manage-api-keys y la base lo
// exigen). Ver esScopeMessenger en ./apiKeysEscritura.
const DIAS_MESSENGER = [30, 90];

// Por si el servidor no manda el catálogo: solo claves y grupos (los grupos son
// datos: tienen que coincidir con SCOPE_GROUPS del servidor). Los textos salen del
// diccionario (label/description vacíos → etiquetaScope/descripcionScope).
const FALLBACK_CATALOG: ScopeDef[] = [
  { key: "creators:read", group: "Creadoras", label: "", description: "" },
  { key: "contacts:read", group: "Contactos", label: "", description: "" },
  { key: "contacts:phone", group: "Contactos", label: "", description: "" },
  { key: "employees:read", group: "Empleados", label: "", description: "" },
  { key: "hubstaff:read", group: "Empleados", label: "", description: "" },
  { key: "cowork:read", group: "Empleados", label: "", description: "" },
  { key: "sales:read", group: "Ventas", label: "", description: "" },
  { key: "sales:chatters", group: "Ventas", label: "", description: "" },
  { key: "promolog:read", group: "Promolog", label: "", description: "" },
];
const FALLBACK_GROUPS = ["Creadoras", "Contactos", "Empleados", "Ventas", "Promolog"];

// El catálogo lo manda el servidor en español. En inglés, cada scope y cada grupo
// se muestra con su traducción; si llega uno que no está acá, su texto original.
const TEXTOS_SCOPE: Record<string, { label: TranslationKey; desc: TranslationKey }> = {
  "creators:read": { label: "apiKeys.scope.creators.label", desc: "apiKeys.scope.creators.desc" },
  "contacts:read": { label: "apiKeys.scope.contacts.label", desc: "apiKeys.scope.contacts.desc" },
  "contacts:phone": { label: "apiKeys.scope.phone.label", desc: "apiKeys.scope.phone.desc" },
  "employees:read": { label: "apiKeys.scope.employees.label", desc: "apiKeys.scope.employees.desc" },
  "hubstaff:read": { label: "apiKeys.scope.hubstaff.label", desc: "apiKeys.scope.hubstaff.desc" },
  "cowork:read": { label: "apiKeys.scope.cowork.label", desc: "apiKeys.scope.cowork.desc" },
  "sales:read": { label: "apiKeys.scope.sales.label", desc: "apiKeys.scope.sales.desc" },
  "sales:chatters": { label: "apiKeys.scope.salesChatters.label", desc: "apiKeys.scope.salesChatters.desc" },
  "promolog:read": { label: "apiKeys.scope.promolog.label", desc: "apiKeys.scope.promolog.desc" },
  "messenger:read": { label: "apiKeys.scope.messenger.label", desc: "apiKeys.scope.messenger.desc" },
  "messenger:write": { label: "apiKeys.scope.messengerWrite.label", desc: "apiKeys.scope.messengerWrite.desc" },
};

const TEXTO_DEL_NOMBRE: Record<ProblemaDelNombre, TranslationKey> = {
  vacio: "apiKeys.form.displayName.required",
  forma: "apiKeys.form.displayName.format",
  reservado: "apiKeys.form.displayName.reserved",
};
const TEXTO_DEL_ESTADO: Record<ApiKey["status"], TranslationKey> = {
  active: "apiKeys.status.active",
  revoked: "apiKeys.status.revoked",
  expired: "apiKeys.status.expired",
};
const TEXTOS_GRUPO: Record<string, TranslationKey> = {
  Creadoras: "apiKeys.group.Creadoras",
  Contactos: "apiKeys.group.Contactos",
  Empleados: "apiKeys.group.Empleados",
  Ventas: "apiKeys.group.Ventas",
  Promolog: "apiKeys.group.Promolog",
  Messenger: "apiKeys.group.Messenger",
};

const API_BASE =
  `${import.meta.env.VITE_SUPABASE_URL ?? "https://lsagslbkliprespbyhts.supabase.co"}/functions/v1/public-api`;

// Mandar un mensaje: los dos encabezados que exige un POST de escritura. La
// Idempotency-Key se genera una por mensaje y se repite tal cual en cada reintento.
const EJEMPLO_ESCRITURA = `curl -X POST "${API_BASE}/messenger/conversations/{id}/messages" \\
  -H "Authorization: Bearer mvk_live_..." \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: 6f1c2e0a-report-2026-10-01" \\
  -d '{"text": "Daily report is ready", "reply_to_id": null, "thread": false}'`;

const EXPIRY_OPTIONS: { label: TranslationKey; days: number }[] = [
  { label: "apiKeys.form.exp30", days: 30 },
  { label: "apiKeys.form.exp90", days: 90 },
  { label: "apiKeys.form.exp365", days: 365 },
  { label: "apiKeys.never", days: 0 },
];

function fmt(d: string | null, locale: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

const AdminApiKeys = () => {
  const qc = useQueryClient();
  const f = useFormato();
  const { t, language } = useLanguage();
  // El servidor contesta sus errores en el idioma de la pantalla.
  const lang = language;
  const [modalMode, setModalMode] = useState<null | "create" | "edit">(null);
  const [editing, setEditing] = useState<ApiKey | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  // El webhook de qué key se mira. `vez` cambia en cada apertura y es la key del
  // diálogo: se monta de nuevo, así nada (secreto, resultado de una prueba) pasa de
  // una key a otra. Al cerrar se conserva `id` para que la animación de salida siga
  // dibujando el contenido.
  const [webhookDe, setWebhookDe] = useState<{ id: string; vez: number } | null>(null);
  const [webhookAbierto, setWebhookAbierto] = useState(false);
  // Para onCerrado: si mientras terminaba de cerrarse ya se abrió otro, no se toca.
  const webhookAbiertoRef = useRef(false);
  webhookAbiertoRef.current = webhookAbierto;
  const abrirWebhook = (id: string) => {
    setWebhookDe((antes) => ({ id, vez: (antes?.vez ?? 0) + 1 }));
    setWebhookAbierto(true);
    // La lista puede tener hasta 5 min (staleTime global): al abrir, se relee.
    void qc.invalidateQueries({ queryKey: ["api-keys"] }).then(() => {}, () => {});
  };

  // Form
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["creators:read"]);
  const [ipMode, setIpMode] = useState<"none" | "restrict">("none");
  const [ipText, setIpText] = useState("");
  const [expiryDays, setExpiryDays] = useState<number>(30); // -1 = mantener (solo edición)
  const [confirmaMessenger, setConfirmaMessenger] = useState(false);
  // messenger:write: el nombre visible, la key que esta reemplaza (rotación) y la
  // confirmación propia (acknowledge_messenger_writes_as).
  const [nombreVisible, setNombreVisible] = useState("");
  const [reemplazaA, setReemplazaA] = useState("");
  const [confirmaEscritura, setConfirmaEscritura] = useState(false);
  // El último error del servidor al guardar, en sus palabras (ya traducido): queda a
  // la vista mientras se corrige, no solo en el aviso que se va.
  const [errorAlGuardar, setErrorAlGuardar] = useState<string | null>(null);
  // De qué key se retira lo que mandó. `vez` remonta el diálogo en cada apertura.
  const [retirarDe, setRetirarDe] = useState<{ llave: ApiKey; vez: number } | null>(null);
  const createMutPendiente = useRef(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => adminInvoke<ListResp>("manage-api-keys", { action: "list", lang }),
  });

  const keys = useMemo<ApiKey[]>(() => data?.keys ?? [], [data]);
  const caras = useCaras(keys.flatMap((k) => [k.acts_as?.id, k.webhook?.paused_by?.id]));
  const catalog = data?.scope_catalog?.length ? data.scope_catalog : FALLBACK_CATALOG;
  const groups = data?.scope_groups?.length ? data.scope_groups : FALLBACK_GROUPS;
  const maxActive = data?.max_active_keys ?? 3;
  const activeCount = useMemo(() => keys.filter((k) => k.status === "active").length, [keys]);
  const atLimit = activeCount >= maxActive;

  const parseIps = () =>
    ipMode === "none" ? [] : ipText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

  const conMessenger = scopes.some(esScopeMessenger);
  const conEscritura = escribe(scopes);
  // El nombre visible: en el alta, siempre que escriba; al editar, solo si cambió (el
  // de hoy ya lo aceptó la base).
  const nombreVisibleOriginal = editing?.api_display_name ?? null;
  const nombreVisibleCambio = modalMode === "create" || normalizarNombreVisible(nombreVisible) !== (nombreVisibleOriginal ?? "");
  const problemaDelNombre = conEscritura && nombreVisibleCambio ? problemaDelNombreVisible(nombreVisible) : null;
  // La rotación: otra key de la MISMA persona que escribía (también revocada o vencida:
  // es justo cuando se la reemplaza). El servidor vuelve a exigir persona y agencia.
  const reemplazables = useMemo(
    () => keys.filter((k) => escribe(k.scopes) && !!data?.you?.id && k.acts_as?.id === data.you.id),
    [keys, data?.you?.id],
  );
  // Sin nombre (perfil sin full_name) no se arma "ALL of you's": hay una frase propia.
  const yoNombre = data?.you?.name?.trim() || null;
  // En español manda el texto del servidor (es la fuente); en inglés, o si el
  // servidor no mandó texto, el del diccionario.
  const etiquetaScope = (s: ScopeDef) =>
    (language === "en" || !s.label) && TEXTOS_SCOPE[s.key] ? t(TEXTOS_SCOPE[s.key].label) : s.label;
  const descripcionScope = (s: ScopeDef) =>
    (language === "en" || !s.description) && TEXTOS_SCOPE[s.key] ? t(TEXTOS_SCOPE[s.key].desc) : s.description;
  const nombreGrupo = (g: string) => (language === "en" && TEXTOS_GRUPO[g] ? t(TEXTOS_GRUPO[g]) : g);
  const ipsConRango = parseIps().some((ip) => ip.includes("/"));

  const resetForm = () => {
    setName(""); setScopes(["creators:read"]); setIpMode("none"); setIpText(""); setExpiryDays(30); setFreshKey(null);
    setConfirmaMessenger(false);
    setNombreVisible(""); setReemplazaA(""); setConfirmaEscritura(false); setErrorAlGuardar(null);
  };
  const openCreate = () => { resetForm(); setEditing(null); setModalMode("create"); };
  const openEdit = (k: ApiKey) => {
    setEditing(k); setName(k.name); setScopes(k.scopes);
    setIpMode(k.ip_whitelist?.length ? "restrict" : "none");
    setIpText((k.ip_whitelist ?? []).join("\n"));
    setNombreVisible(k.api_display_name ?? ""); setReemplazaA(""); setConfirmaEscritura(false); setErrorAlGuardar(null);
    setExpiryDays(-1); setFreshKey(null); setModalMode("edit");
  };
  // Con el alta en vuelo no se cierra: la key llega UNA vez y, con el modal cerrado,
  // quedaba creada (ocupando un cupo) sin que nadie la viera.
  const closeModal = () => {
    if (createMutPendiente.current) return;
    setModalMode(null); setEditing(null); setFreshKey(null);
  };

  const expiresAtFromChoice = (): string | null | undefined => {
    if (expiryDays === -1) return undefined; // mantener (no tocar)
    if (expiryDays === 0) return null;        // nunca
    return new Date(Date.now() + expiryDays * 86400_000).toISOString();
  };

  const createMut = useMutation({
    mutationFn: async () =>
      adminInvoke<{ key: string }>("manage-api-keys", {
        action: "create", lang, name: name.trim(), scopes, ip_whitelist: parseIps(),
        // Los días los convierte en fecha el servidor (el reloj de la PC puede estar
        // adelantado); expires_at queda por si responde un manage-api-keys anterior.
        expires_in_days: expiryDays,
        expires_at: expiryDays === 0 ? null : new Date(Date.now() + expiryDays * 86400_000).toISOString(),
        // Solo si la persona lo confirmó en la pantalla: sin esto el servidor no la crea.
        ...(conMessenger && confirmaMessenger && data?.you?.id ? { acknowledge_messenger_reads_as: data.you.id } : {}),
        // messenger:write: el nombre visible (lo valida la base), la rotación y la
        // confirmación de que escribirá a SU nombre (el servidor exige que sea la de
        // quien la crea). Sin write no se manda nada de esto.
        ...(conEscritura ? { display_name: normalizarNombreVisible(nombreVisible) } : {}),
        ...(conEscritura && reemplazaA ? { replaces_key_id: reemplazaA } : {}),
        ...(conEscritura && confirmaEscritura && data?.you?.id ? { acknowledge_messenger_writes_as: data.you.id } : {}),
      }),
    // La key entera viaja UNA vez: vive en freshKey y la mutación la suelta (si no,
    // quedaba en la MutationCache mientras la página siguiera abierta).
    gcTime: 0,
    // Sin red no se pausa (el modal quedaba sin poder cerrarse): falla enseguida.
    networkMode: "always",
    onSuccess: (res) => { setFreshKey(res.key); qc.invalidateQueries({ queryKey: ["api-keys"] }); toast.success(t("apiKeys.toast.created")); },
    onError: (e) => {
      const m = (e as Error)?.message || t("apiKeys.toast.createFailed");
      setErrorAlGuardar(m); toast.error(m);
    },
    onSettled: () => { createMutPendiente.current = false; queueMicrotask(() => createMut.reset()); },
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      const patch: Record<string, unknown> = { action: "update", lang, id: editing!.id, name: name.trim(), scopes, ip_whitelist: parseIps() };
      const exp = expiresAtFromChoice();
      // Con Messenger, al editar el vencimiento solo se mantiene (la pantalla no ofrece
      // otra cosa): no se manda aunque quede elegido de antes de volver a tildarlo.
      if (exp !== undefined && !conMessenger) patch.expires_at = exp;
      // El nombre visible solo si sigue escribiendo y cambió (lo cambia solo su persona).
      if (conEscritura && nombreVisibleCambio) patch.display_name = normalizarNombreVisible(nombreVisible);
      return adminInvoke("manage-api-keys", patch);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-keys"] }); toast.success(t("apiKeys.toast.updated")); closeModal(); },
    onError: (e) => {
      const m = (e as Error)?.message || t("apiKeys.toast.updateFailed");
      setErrorAlGuardar(m); toast.error(m);
    },
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => adminInvoke("manage-api-keys", { action: "revoke", lang, id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-keys"] }); toast.success(t("apiKeys.toast.revoked")); setRevokeTarget(null); },
    onError: (e) => toast.error((e as Error)?.message ?? t("apiKeys.toast.revokeFailed")),
  });

  const toggleScope = (k: string) => {
    // write va con read: tildar write tilda read, y destildar read destilda write.
    const nuevos = alternarScope(scopes, k);
    setScopes(nuevos);
    const habia = scopes.some(esScopeMessenger);
    const hay = nuevos.some(esScopeMessenger);
    if (hay && !habia) {
      // Messenger exige IPs fijas y vencimiento corto: se ponen solos.
      setIpMode("restrict");
      if (modalMode === "create" && !DIAS_MESSENGER.includes(expiryDays)) setExpiryDays(30);
      if (modalMode === "edit") setExpiryDays(-1);
    }
    if (!hay) setConfirmaMessenger(false);
    if (!escribe(nuevos)) { setConfirmaEscritura(false); setReemplazaA(""); }
  };

  // La rotación trae el nombre visible de la key reemplazada (el servidor hace lo mismo
  // si no viene otro); se puede cambiar.
  const elegirReemplazo = (id: string) => {
    setReemplazaA(id);
    const vieja = reemplazables.find((k) => k.id === id);
    if (vieja?.api_display_name) setNombreVisible(vieja.api_display_name);
  };

  const submitting = createMut.isPending || updateMut.isPending;
  const reglasMessengerOk = !conMessenger || (
    ipMode === "restrict" && parseIps().length > 0 && !ipsConRango &&
    (modalMode === "edit" ? true : confirmaMessenger && DIAS_MESSENGER.includes(expiryDays))
  );
  const reglasEscrituraOk = !conEscritura || (
    problemaDelNombre === null && (modalMode === "edit" ? true : confirmaEscritura && !!data?.you?.id)
  );
  const canSubmit = name.trim() && scopes.length > 0 && !submitting &&
    (ipMode === "none" || parseIps().length > 0) && reglasMessengerOk && reglasEscrituraOk;

  return (
    <div className="space-y-5 p-6 lg:p-8">
      {/* Header */}
      <PageHeader
        title="API keys"
        subtitle={t("apiKeys.subtitle")}
        icon={<KeyRound />}
        actions={
          <>
            <Button variant="outline" className="gap-1.5" onClick={() => setDocsOpen(true)}>
              <BookOpen className="h-4 w-4" /> {t("apiKeys.apiReference")}
            </Button>
            <Button className="gap-1.5" onClick={openCreate} disabled={atLimit}
              title={atLimit ? t("apiKeys.maxActive", { max: maxActive }) : undefined}>
              <Plus className="h-4 w-4" /> {t("apiKeys.createKey")}
            </Button>
          </>
        }
      />

      {/* Banner de aviso */}
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="flex gap-3 p-4 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="space-y-0.5 text-muted-foreground">
            <p><span className="font-medium text-foreground">{t("apiKeys.banner.internal")}</span> {t("apiKeys.banner.noShare")}</p>
            <p><ConFormato texto={t("apiKeys.banner.limit", { max: maxActive, active: activeCount })} /></p>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : isError && !data ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
            <ShieldAlert className="h-4 w-4" /> {(error as Error)?.message ?? t("apiKeys.loadError")}
          </CardContent>
        </Card>
      ) : keys.length === 0 && !isError ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {t("apiKeys.empty", { button: t("apiKeys.createKey") })}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Una relectura que falla deja lo que ya había (react-query conserva data):
              se avisa y se ofrece reintentar, en vez de esconder la tabla. */}
          {isError && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-warning/30 bg-warning/5 px-4 py-2 text-xs text-foreground">
              <span>{t("apiKeys.refreshFailed")}</span>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void refetch()}>{t("common.retry")}</Button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="tabla-movil w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t("common.name")}</th>
                  <th className="px-4 py-3 font-medium">{t("apiKeys.col.key")}</th>
                  <th className="px-4 py-3 font-medium">{t("apiKeys.col.created")}</th>
                  <th className="px-4 py-3 font-medium">{t("apiKeys.col.createdBy")}</th>
                  <th className="px-4 py-3 font-medium" title={t("apiKeys.col.actsAsHint")}>{t("apiKeys.col.actsAs")}</th>
                  <th className="px-4 py-3 font-medium">{t("apiKeys.col.ipWhitelist")}</th>
                  <th className="px-4 py-3 font-medium">{t("apiKeys.col.expires")}</th>
                  <th className="px-4 py-3 font-medium">{t("common.status")}</th>
                  <th className="px-4 py-3 font-medium">{t("apiKeys.col.webhook")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className={`border-b border-border/40 ${k.status !== "active" ? "opacity-60" : ""}`}>
                    <td data-label={t("common.name")} className="px-4 py-3 font-medium">
                      {/* Un solo hijo: en el teléfono (tabla-movil) la celda es flex y el
                          nombre y sus scopes se repartían a lo ancho. */}
                      <div>
                        {k.name}
                        <div className="mt-0.5 flex flex-wrap justify-end gap-1 md:justify-start">
                          {k.scopes.map((s) => <Badge key={s} variant="secondary" className="font-normal text-[10px]">{s}</Badge>)}
                        </div>
                      </div>
                    </td>
                    <td data-label={t("apiKeys.col.key")} className="px-4 py-3"><code className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 text-xs">{k.key_prefix}…{k.last_four ?? ""}</code></td>
                    <td data-label={t("apiKeys.col.created")} className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmt(k.created_at, f.intl("es-CO"))}</td>
                    <td data-label={t("apiKeys.col.createdBy")} className="px-4 py-3 whitespace-nowrap text-muted-foreground">{k.created_by_email ?? "—"}</td>
                    <td data-label={t("apiKeys.col.actsAs")} className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {k.acts_as ? (
                        <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                          <Persona nombre={k.acts_as.name} cara={caras.get(k.acts_as.id)} />
                          {/* «Jhon Lopez · como «BLU»»: el nombre visible es un dato, no se traduce. */}
                          {escribe(k.scopes) && k.api_display_name && (
                            <span className="truncate" data-nombre-visible>· {t("apiKeys.actsAsDisplayName", { name: k.api_display_name })}</span>
                          )}
                        </span>
                      ) : "—"}
                    </td>
                    <td data-label={t("apiKeys.col.ipWhitelist")} className="px-4 py-3 text-muted-foreground">
                      {k.ip_whitelist?.length ? (
                        <span title={k.ip_whitelist.join(", ")}>{k.ip_whitelist.length} IP{k.ip_whitelist.length > 1 ? "s" : ""}</span>
                      ) : <span className="text-muted-foreground/70">{t("apiKeys.noRestriction")}</span>}
                    </td>
                    <td data-label={t("apiKeys.col.expires")} className="px-4 py-3 whitespace-nowrap text-muted-foreground">{k.expires_at ? fmt(k.expires_at, f.intl("es-CO")) : t("apiKeys.never")}</td>
                    <td data-label={t("common.status")} className="px-4 py-3">
                      {k.status === "active" && k.acts_as?.active === false && (
                        <Badge variant="outline" className="border-destructive/40 text-destructive"
                          title={t("apiKeys.status.personGoneHint")}>
                          {t("apiKeys.status.personGone")}
                        </Badge>
                      )}
                      {k.status === "active" && k.acts_as?.active === true && <Badge variant="outline" className="border-success/40 text-success">{t("apiKeys.status.active")}</Badge>}
                      {k.status === "active" && (k.acts_as?.active ?? null) === null && (
                        <Badge variant="outline" className="text-muted-foreground"
                          title={t("apiKeys.status.unverifiedHint")}>
                          {t("apiKeys.status.unverified")}
                        </Badge>
                      )}
                      {k.status === "revoked" && <Badge variant="outline" className="border-destructive/40 text-destructive">{t("apiKeys.status.revoked")}</Badge>}
                      {k.status === "expired" && <Badge variant="outline" className="text-muted-foreground">{t("apiKeys.status.expired")}</Badge>}
                    </td>
                    {/* data-webhook-celda + tabIndex -1: si al cerrar el diálogo el botón que
                        lo abrió ya no está, el foco vuelve a esta celda. */}
                    <td data-label={t("apiKeys.col.webhook")} data-webhook-celda={k.id} tabIndex={-1}
                      className="px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                      <CeldaWebhook llave={k} youId={data?.you?.id} desconocido={data?.webhooks_unknown === true}
                        onAbrir={() => abrirWebhook(k.id)} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {/* En toda key que escribe, también revocada o vencida: es justo
                            cuando hace falta limpiar lo que mandó. */}
                        {escribe(k.scopes) && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setRetirarDe((antes) => ({ llave: k, vez: (antes?.vez ?? 0) + 1 }))}
                            title={t("apiKeys.withdraw.button")} aria-label={t("apiKeys.withdraw.button")}>
                            <MessageSquareX className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {k.status === "active" && (
                          <>
                            {!(k.scopes.some(esScopeMessenger) && data?.you?.id && k.acts_as?.id !== data.you.id) && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(k)} title={t("common.edit")}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setRevokeTarget(k)} title={t("apiKeys.revoke")}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Retirar lo que mandó una integración (en tandas, con confirmación) */}
      {retirarDe && <DialogoRetirada key={retirarDe.vez} llave={retirarDe.llave} onCerrar={() => setRetirarDe(null)} />}

      {/* Webhook de una key: registrar, estado y entregas */}
      <DialogoWebhook key={webhookDe?.vez ?? 0} abierto={webhookAbierto}
        llave={webhookDe ? keys.find((k) => k.id === webhookDe.id) ?? null : null}
        desconocido={data?.webhooks_unknown === true} listaConError={isError}
        youId={data?.you?.id} caras={caras} onCerrar={() => setWebhookAbierto(false)}
        onCerrado={() => { if (!webhookAbiertoRef.current) setWebhookDe(null); }} />

      {/* Modal crear / editar / mostrar key */}
      <Dialog open={modalMode !== null} onOpenChange={(o) => { if (!o) closeModal(); }}>
        <DialogContent className="max-h-[85vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-lg">
          {freshKey ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Check className="h-5 w-5 text-success" /> {t("apiKeys.fresh.title")}</DialogTitle>
                <DialogDescription>
                  <ConFormato texto={t("apiKeys.fresh.copyNow")} />
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
                  <code className="block break-all font-mono text-sm text-foreground">{freshKey}</code>
                </div>
                <div className="flex justify-end"><CopyButton text={freshKey} label={t("apiKeys.fresh.copyKey")} /></div>
              </div>
              <DialogFooter><Button onClick={closeModal}>{t("apiKeys.fresh.done")}</Button></DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{modalMode === "edit" ? t("apiKeys.form.editTitle") : t("apiKeys.createKey")}</DialogTitle>
                <DialogDescription>
                  {t("apiKeys.form.description")}
                  {modalMode !== "edit" && ` ${t("apiKeys.form.actsAsYou")}`}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5">
                {/* Nombre */}
                <div className="space-y-1.5">
                  <Label htmlFor="key-name">{t("common.name")}</Label>
                  <Input id="key-name" placeholder={t("apiKeys.form.namePlaceholder")} value={name}
                    onChange={(e) => setName(e.target.value)} autoFocus />
                </div>

                {/* IP whitelist */}
                <div className="space-y-2">
                  <Label>{t("apiKeys.col.ipWhitelist")}</Label>
                  {!conMessenger && (
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                      <input type="radio" className="mt-1 accent-primary" checked={ipMode === "none"} onChange={() => setIpMode("none")} />
                      <span><span className="font-medium">{t("apiKeys.noRestriction")}</span><span className="block text-xs text-muted-foreground">{t("apiKeys.form.noRestrictionHint")}</span></span>
                    </label>
                  )}
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                    <input type="radio" className="mt-1 accent-primary" checked={ipMode === "restrict"} onChange={() => setIpMode("restrict")} />
                    <span><span className="font-medium">{t("apiKeys.form.restrict")}</span><span className="block text-xs text-muted-foreground">{t("apiKeys.form.restrictHint")}</span></span>
                  </label>
                  {ipMode === "restrict" && (
                    <textarea
                      className="min-h-[64px] w-full rounded-md border border-border/60 bg-background p-2 text-sm"
                      placeholder={conMessenger ? t("apiKeys.form.ipPlaceholderMessenger") : t("apiKeys.form.ipPlaceholder")}
                      value={ipText} onChange={(e) => setIpText(e.target.value)} />
                  )}
                  {conMessenger && (
                    <p className={`text-xs ${ipsConRango ? "text-destructive" : "text-muted-foreground"}`}>
                      {t("apiKeys.form.messengerIpHint")}
                    </p>
                  )}
                </div>

                {/* Expiración */}
                <div className="space-y-1.5">
                  <Label>{t("apiKeys.form.expiration")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {modalMode === "edit" && (
                      <button type="button" onClick={() => setExpiryDays(-1)}
                        className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${expiryDays === -1 ? "border-primary bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:bg-muted/30"}`}>
                        {t("apiKeys.form.keepCurrent")}
                      </button>
                    )}
                    {EXPIRY_OPTIONS
                      // Con Messenger: 90 días como máximo al crear, y al editar solo se
                      // mantiene (renovarla es crear otra).
                      .filter((o) => !conMessenger || (modalMode === "create" && DIAS_MESSENGER.includes(o.days)))
                      .map((o) => (
                      <button key={o.days} type="button" onClick={() => setExpiryDays(o.days)}
                        className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${expiryDays === o.days ? "border-primary bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:bg-muted/30"}`}>
                        {t(o.label)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* API scopes agrupados */}
                <div className="space-y-3">
                  <Label>{t("apiKeys.form.scopes")}</Label>
                  {groups.map((group) => {
                    const items = catalog.filter((s) => s.group === group);
                    if (!items.length) return null;
                    return (
                      <div key={group} className="rounded-lg border border-border/60 bg-muted/10 p-3">
                        <div className="mb-2 text-sm font-semibold">{nombreGrupo(group)}</div>
                        <div className="space-y-1.5">
                          {items.map((s) => {
                            // En edición, Messenger solo se puede conservar o sacar, nunca sumar:
                            // un scope del Messenger que la key no tenía no se tilda.
                            const bloqueado = esScopeMessenger(s.key) && modalMode === "edit" && !editing?.scopes.includes(s.key);
                            return (
                            <label key={s.key}
                              className={`flex items-start gap-2.5 rounded-md p-1.5 ${bloqueado ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/30"}`}
                              title={bloqueado ? t("apiKeys.form.messengerOnlyNew") : undefined}>
                              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" disabled={bloqueado}
                                checked={scopes.includes(s.key)} onChange={() => toggleScope(s.key)} />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium">{etiquetaScope(s)}</span>
                                  {esScopeDeEscritura(s.key)
                                    ? <span className="shrink-0 text-xs font-medium text-destructive">{t("apiKeys.form.writes")}</span>
                                    : <span className="shrink-0 text-xs text-muted-foreground">{t("apiKeys.form.readOnly")}</span>}
                                </span>
                                <span className="block text-xs text-muted-foreground"><ConFormato texto={descripcionScope(s)} /></span>
                                <code className="text-[10px] text-muted-foreground">{s.key}</code>
                              </span>
                            </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* messenger:write: el nombre visible (y, al crear, a qué key reemplaza) */}
                {conEscritura && (
                  <div className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="key-display-name">{t("apiKeys.form.displayName")}</Label>
                      <Input id="key-display-name" placeholder={t("apiKeys.form.displayNamePlaceholder")} value={nombreVisible}
                        maxLength={64} aria-invalid={problemaDelNombre !== null && nombreVisible !== ""}
                        aria-describedby="key-display-name-hint"
                        onChange={(e) => { setNombreVisible(e.target.value); setErrorAlGuardar(null); }} />
                      {/* Vacío todavía no es un error que se marque: el botón sigue apagado. */}
                      {problemaDelNombre && nombreVisible !== "" && (
                        <p className="text-xs text-destructive" data-error-nombre-visible>{t(TEXTO_DEL_NOMBRE[problemaDelNombre])}</p>
                      )}
                      <p id="key-display-name-hint" className="text-xs text-muted-foreground">{t("apiKeys.form.displayNameHint")}</p>
                    </div>
                    {modalMode === "create" && reemplazables.length > 0 && (
                      <div className="space-y-1.5">
                        <Label htmlFor="key-replaces">{t("apiKeys.form.replaces")}</Label>
                        <select id="key-replaces" value={reemplazaA} onChange={(e) => elegirReemplazo(e.target.value)}
                          className="w-full rounded-md border border-border/60 bg-background p-2 text-sm">
                          <option value="">{t("apiKeys.form.replacesNone")}</option>
                          {reemplazables.map((k) => (
                            <option key={k.id} value={k.id}>
                              {t("apiKeys.form.replacesOption", { name: k.name, display: k.api_display_name ?? "—", status: t(TEXTO_DEL_ESTADO[k.status]) })}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">{t("apiKeys.form.replacesHint")}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {conMessenger && modalMode === "create" && (
                <div className="mt-4 space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <p className="font-medium text-foreground">
                    {yoNombre ? t("apiKeys.form.messengerTitle", { name: yoNombre }) : t("apiKeys.form.messengerTitleYou")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("apiKeys.form.messengerBody")}
                  </p>
                  <label className="flex cursor-pointer items-start gap-2 text-xs">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-destructive"
                      checked={confirmaMessenger} onChange={(e) => setConfirmaMessenger(e.target.checked)} />
                    <span>{t("apiKeys.form.messengerConfirm")}</span>
                  </label>
                </div>
              )}
              {conEscritura && modalMode === "create" && (
                <div className="mt-3 space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" data-confirma-escritura>
                  <p className="font-medium text-foreground">
                    {yoNombre ? t("apiKeys.form.writeTitle", { name: yoNombre }) : t("apiKeys.form.writeTitleYou")}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("apiKeys.form.writeBody")}</p>
                  <label className="flex cursor-pointer items-start gap-2 text-xs">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-destructive"
                      checked={confirmaEscritura} onChange={(e) => setConfirmaEscritura(e.target.checked)} />
                    <span>{t("apiKeys.form.writeConfirm")}</span>
                  </label>
                </div>
              )}
              {conEscritura && modalMode === "create" && <div className="mt-3"><AvisoVersionesViejas /></div>}
              {errorAlGuardar && (
                <p role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">{errorAlGuardar}</p>
              )}
              <DialogFooter>
                <Button variant="ghost" onClick={closeModal} disabled={createMut.isPending}>{t("common.cancel")}</Button>
                <Button className="gap-1.5" disabled={!canSubmit}
                  onClick={() => {
                    if (modalMode === "edit") { updateMut.mutate(); return; }
                    // Se marca ACÁ (onMutate corre después de un await): desde el toque, no se
                    // cierra. Y un segundo toque antes de que se dibuje isPending no crea otra.
                    if (createMutPendiente.current) return;
                    createMutPendiente.current = true;
                    createMut.mutate();
                  }}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {modalMode === "edit" ? t("common.save") : t("apiKeys.form.create")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* API reference */}
      <Dialog open={docsOpen} onOpenChange={setDocsOpen}>
        {/* grid-cols-[minmax(0,1fr)]: sin esto la columna del diálogo toma el ancho
            del contenido que no se puede partir (el `curl` del ejemplo) y todo se sale
            por la derecha: medido en prod el 25/09, 659 px de lugar y la columna en
            728. Así el ejemplo se desplaza en SU caja y el resto se acomoda. */}
        <DialogContent className="max-h-[85vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> {t("apiKeys.apiReference")}</DialogTitle>
            <DialogDescription>{t("apiKeys.docs.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div>
              <div className="mb-1 font-medium">{t("apiKeys.docs.baseUrl")}</div>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border/60 bg-background px-3 py-2 text-xs">{API_BASE}</code>
                <CopyButton text={API_BASE} />
              </div>
            </div>
            <div>
              <div className="mb-1 font-medium">{t("apiKeys.docs.auth")}</div>
              <p className="text-xs text-muted-foreground"><ConFormato texto={t("apiKeys.docs.authSend")} /></p>
              <p className="mt-1 text-xs text-muted-foreground"><ConFormato texto={t("apiKeys.docs.authActsAs")} /></p>
            </div>
            <div>
              <div className="mb-1 font-medium">{t("apiKeys.docs.limit")}</div>
              <p className="text-xs text-muted-foreground"><ConFormato texto={t("apiKeys.docs.limitBody")} /></p>
            </div>
            <div>
              <div className="mb-1 font-medium">{t("apiKeys.docs.language")}</div>
              <p className="text-xs text-muted-foreground"><ConFormato texto={t("apiKeys.docs.languageBody")} /></p>
            </div>
            <div>
              <div className="mb-1 font-medium">{t("apiKeys.docs.example")}</div>
              <div className="rounded-md border border-border/60 bg-background p-3">
                <pre className="overflow-x-auto text-[11px] leading-relaxed">{`curl "${API_BASE}/creators?status=active&limit=100" \\
  -H "Authorization: Bearer mvk_live_..."`}</pre>
              </div>
            </div>
            <div>
              <div className="mb-2 font-medium">{t("apiKeys.docs.endpoints")}</div>
              <div className="space-y-2 text-xs">
                {([
                  { m: "GET", p: "/me", s: null, d: "apiKeys.ep.me" },
                  { m: "GET", p: "/messenger/conversations", s: "messenger:read", d: "apiKeys.ep.conversations" },
                  { m: "GET", p: "/messenger/conversations/{id}", s: "messenger:read", d: "apiKeys.ep.conversation" },
                  { m: "GET", p: "/messenger/conversations/{id}/messages", s: "messenger:read", d: "apiKeys.ep.messages" },
                  { m: "GET", p: "/messenger/feed", s: "messenger:read", d: "apiKeys.ep.feed" },
                  { m: "GET", p: "/messenger/people", s: SCOPE_MESSENGER_ESCRITURA, d: "apiKeys.ep.people" },
                  { m: "POST", p: "/messenger/conversations", s: SCOPE_MESSENGER_ESCRITURA, d: "apiKeys.ep.openDirect" },
                  { m: "POST", p: "/messenger/conversations/{id}/messages", s: SCOPE_MESSENGER_ESCRITURA, d: "apiKeys.ep.send" },
                  { m: "PATCH", p: "/messenger/conversations/{id}/messages/{message_id}", s: SCOPE_MESSENGER_ESCRITURA, d: "apiKeys.ep.edit" },
                  { m: "DELETE", p: "/messenger/conversations/{id}/messages/{message_id}", s: SCOPE_MESSENGER_ESCRITURA, d: "apiKeys.ep.delete" },
                  { m: "GET", p: "/creators", s: "creators:read", d: "apiKeys.ep.creators" },
                  { m: "GET", p: "/creators/{id}", s: "creators:read", d: "apiKeys.ep.creator" },
                  { m: "GET", p: "/contacts", s: "contacts:read", d: "apiKeys.ep.contacts" },
                  { m: "GET", p: "/contacts/{id}", s: "contacts:read", d: "apiKeys.ep.contact" },
                  { m: "GET", p: "/employees", s: "employees:read", d: "apiKeys.ep.employees" },
                  { m: "GET", p: "/hubstaff", s: "hubstaff:read", d: "apiKeys.ep.hubstaff" },
                  { m: "GET", p: "/cowork/time", s: "cowork:read", d: "apiKeys.ep.coworkTime" },
                  { m: "GET", p: "/cowork/time/segments", s: "cowork:read", d: "apiKeys.ep.coworkSegments" },
                  { m: "GET", p: "/cowork/breaks", s: "cowork:read", d: "apiKeys.ep.coworkBreaks" },
                  { m: "GET", p: "/cowork/meets", s: "cowork:read", d: "apiKeys.ep.coworkMeets" },
                  { m: "GET", p: "/sales", s: "sales:read", d: "apiKeys.ep.sales" },
                  { m: "GET", p: "/sales/chatters", s: "sales:chatters", d: "apiKeys.ep.salesChatters" },
                  { m: "GET", p: "/promolog", s: "promolog:read", d: "apiKeys.ep.promolog" },
                ] as { m: string; p: string; s: string | null; d: TranslationKey }[]).map((e) => (
                  // La key es método + ruta: GET y POST /messenger/conversations son dos.
                  <div key={`${e.m} ${e.p}`} className="rounded-md border border-border/60 p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">{e.m}</Badge>
                      <code className="font-medium">{e.p}</code>
                      {e.s && <Badge variant="secondary" className="font-normal text-[10px]">{e.s}</Badge>}
                    </div>
                    <p className="mt-1 text-muted-foreground">{t(e.d)}</p>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground"><ConFormato texto={t("apiKeys.docs.pagination")} /></p>
            <div data-docs-escritura>
              <div className="mb-1 font-medium">{t("apiKeys.docs.write")}</div>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p><ConFormato texto={t("apiKeys.docs.writeBody")} /></p>
                <p><ConFormato texto={t("apiKeys.docs.writeIdempotency")} /></p>
              </div>
              <div className="mb-1 mt-3 font-medium">{t("apiKeys.docs.writeExample")}</div>
              <div className="rounded-md border border-border/60 bg-background p-3">
                <pre className="overflow-x-auto text-[11px] leading-relaxed">{EJEMPLO_ESCRITURA}</pre>
              </div>
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                <p><ConFormato texto={t("apiKeys.docs.writeLimits")} /></p>
                <p><ConFormato texto={t("apiKeys.docs.writeLoop")} /></p>
                <p className="rounded-md border border-warning/40 bg-warning/5 p-2 text-foreground"><ConFormato texto={t("apiKeys.docs.writeUnknown")} /></p>
              </div>
            </div>
            <DocsWebhooks />
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDocsOpen(false)}>{t("common.close")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar revocar */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => { if (!o) setRevokeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("apiKeys.revokeDialog.title", { name: revokeTarget?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("apiKeys.revokeDialog.body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            {/* bg-none: el botón de Maven es un degradé (background-image) y
                taparía el rojo: sin esto "Revocar" salía violeta. */}
            <AlertDialogAction className="bg-none bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => revokeTarget && revokeMut.mutate(revokeTarget.id)}>
              {revokeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("apiKeys.revoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminApiKeys;
