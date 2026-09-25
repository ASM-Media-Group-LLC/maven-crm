import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound, Plus, Copy, Check, Loader2, ShieldAlert, Trash2, Pencil, BookOpen, ExternalLink, X,
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
};
type ListResp = {
  keys: ApiKey[]; scope_catalog: ScopeDef[]; scope_groups: string[]; max_active_keys: number;
  /** Quién está mirando: una key nueva actúa como esta persona. */
  you?: { id: string; name: string | null };
};

// Leen conversaciones privadas: IPs exactas, vencimiento de 90 días como máximo y
// solo en keys nuevas (decisión del 25/09; manage-api-keys y la base lo exigen).
const SCOPE_MESSENGER = "messenger:read";
const DIAS_MESSENGER = [30, 90];

const FALLBACK_CATALOG: ScopeDef[] = [
  { key: "creators:read", group: "Creadoras", label: "Perfil + redes sociales", description: "Roster de creadoras y sus redes." },
  { key: "contacts:read", group: "Contactos", label: "Contactos y agencias", description: "Directorio comercial: modelos, agencias y ex-creadoras. Teléfono y email ENMASCARADOS." },
  { key: "contacts:phone", group: "Contactos", label: "⚠️ Teléfono y email sin enmascarar", description: "Entrega la base comercial completa. Dentro de Maven este dato es solo-admin; una API key saltea esa capa." },
  { key: "employees:read", group: "Empleados", label: "Roster del equipo", description: "Nombre y rol de los empleados." },
  { key: "hubstaff:read", group: "Empleados", label: "Horas de Hubstaff (diario)", description: "Horas trackeadas, actividad y proyecto por empleado." },
  { key: "cowork:read", group: "Empleados", label: "Tiempo y pausas en Cowork", description: "Reloj de Cowork por empleado y día, cada tramo con su motivo, cada pausa (baño o break) con su tope y cada meet grupal. Reemplazo de Hubstaff." },
  { key: "sales:read", group: "Ventas", label: "Ganancias por creadora (diario)", description: "Ganancias brutas diarias por creadora." },
  { key: "sales:chatters", group: "Ventas", label: "Ventas por chatter (diario)", description: "Ventas diarias por chatter." },
  { key: "promolog:read", group: "Promolog", label: "Promoción diaria", description: "Si cada creadora promocionó cada día, por red." },
];
const FALLBACK_GROUPS = ["Creadoras", "Contactos", "Empleados", "Ventas", "Promolog"];

const API_BASE =
  `${import.meta.env.VITE_SUPABASE_URL ?? "https://lsagslbkliprespbyhts.supabase.co"}/functions/v1/public-api`;

const EXPIRY_OPTIONS = [
  { label: "30 días (recomendado)", days: 30 },
  { label: "90 días", days: 90 },
  { label: "1 año", days: 365 },
  { label: "Nunca", days: 0 },
];

function fmt(d: string | null, locale: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

function CopyButton({ text, label = "Copiar", size = "sm" as "sm" | "default" }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button" variant="outline" size={size} className="gap-1.5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true); toast.success("Copiado");
          setTimeout(() => setDone(false), 2000);
        } catch { toast.error("No se pudo copiar — hazlo manualmente"); }
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}

const AdminApiKeys = () => {
  const qc = useQueryClient();
  const f = useFormato();
  const [modalMode, setModalMode] = useState<null | "create" | "edit">(null);
  const [editing, setEditing] = useState<ApiKey | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);
  const [freshKey, setFreshKey] = useState<string | null>(null);

  // Form
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["creators:read"]);
  const [ipMode, setIpMode] = useState<"none" | "restrict">("none");
  const [ipText, setIpText] = useState("");
  const [expiryDays, setExpiryDays] = useState<number>(30); // -1 = mantener (solo edición)
  const [confirmaMessenger, setConfirmaMessenger] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => adminInvoke<ListResp>("manage-api-keys", { action: "list" }),
  });

  const keys = useMemo<ApiKey[]>(() => data?.keys ?? [], [data]);
  const catalog = data?.scope_catalog?.length ? data.scope_catalog : FALLBACK_CATALOG;
  const groups = data?.scope_groups?.length ? data.scope_groups : FALLBACK_GROUPS;
  const maxActive = data?.max_active_keys ?? 3;
  const activeCount = useMemo(() => keys.filter((k) => k.status === "active").length, [keys]);
  const atLimit = activeCount >= maxActive;

  const parseIps = () =>
    ipMode === "none" ? [] : ipText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

  const conMessenger = scopes.includes(SCOPE_MESSENGER);
  // En edición, Messenger solo se puede conservar o sacar, nunca sumar.
  const teniaMessenger = !!editing?.scopes.includes(SCOPE_MESSENGER);
  const yoNombre = data?.you?.name ?? "vos";
  const ipsConRango = parseIps().some((ip) => ip.includes("/"));

  const resetForm = () => {
    setName(""); setScopes(["creators:read"]); setIpMode("none"); setIpText(""); setExpiryDays(30); setFreshKey(null);
    setConfirmaMessenger(false);
  };
  const openCreate = () => { resetForm(); setEditing(null); setModalMode("create"); };
  const openEdit = (k: ApiKey) => {
    setEditing(k); setName(k.name); setScopes(k.scopes);
    setIpMode(k.ip_whitelist?.length ? "restrict" : "none");
    setIpText((k.ip_whitelist ?? []).join("\n"));
    setExpiryDays(-1); setFreshKey(null); setModalMode("edit");
  };
  const closeModal = () => { setModalMode(null); setEditing(null); setFreshKey(null); };

  const expiresAtFromChoice = (): string | null | undefined => {
    if (expiryDays === -1) return undefined; // mantener (no tocar)
    if (expiryDays === 0) return null;        // nunca
    return new Date(Date.now() + expiryDays * 86400_000).toISOString();
  };

  const createMut = useMutation({
    mutationFn: async () =>
      adminInvoke<{ key: string }>("manage-api-keys", {
        action: "create", name: name.trim(), scopes, ip_whitelist: parseIps(),
        // Los días los convierte en fecha el servidor (el reloj de la PC puede estar
        // adelantado); expires_at queda por si responde un manage-api-keys anterior.
        expires_in_days: expiryDays,
        expires_at: expiryDays === 0 ? null : new Date(Date.now() + expiryDays * 86400_000).toISOString(),
        // Solo si la persona lo confirmó en la pantalla: sin esto el servidor no la crea.
        ...(conMessenger && confirmaMessenger && data?.you?.id ? { acknowledge_messenger_reads_as: data.you.id } : {}),
      }),
    onSuccess: (res) => { setFreshKey(res.key); qc.invalidateQueries({ queryKey: ["api-keys"] }); toast.success("API key creada"); },
    onError: (e) => toast.error((e as Error)?.message ?? "No pude crear la key"),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      const patch: Record<string, unknown> = { action: "update", id: editing!.id, name: name.trim(), scopes, ip_whitelist: parseIps() };
      const exp = expiresAtFromChoice();
      // Con Messenger, al editar el vencimiento solo se mantiene (la pantalla no ofrece
      // otra cosa): no se manda aunque quede elegido de antes de volver a tildarlo.
      if (exp !== undefined && !conMessenger) patch.expires_at = exp;
      return adminInvoke("manage-api-keys", patch);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-keys"] }); toast.success("API key actualizada"); closeModal(); },
    onError: (e) => toast.error((e as Error)?.message ?? "No pude actualizar la key"),
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => adminInvoke("manage-api-keys", { action: "revoke", id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-keys"] }); toast.success("API key revocada"); setRevokeTarget(null); },
    onError: (e) => toast.error((e as Error)?.message ?? "No pude revocar la key"),
  });

  const toggleScope = (k: string) => {
    const activa = !scopes.includes(k);
    setScopes((prev) => prev.includes(k) ? prev.filter((s) => s !== k) : [...prev, k]);
    if (k === SCOPE_MESSENGER && activa) {
      // Messenger exige IPs fijas y vencimiento corto: se ponen solos.
      setIpMode("restrict");
      if (modalMode === "create" && !DIAS_MESSENGER.includes(expiryDays)) setExpiryDays(30);
      if (modalMode === "edit") setExpiryDays(-1);
    }
    if (k === SCOPE_MESSENGER && !activa) setConfirmaMessenger(false);
  };

  const submitting = createMut.isPending || updateMut.isPending;
  const reglasMessengerOk = !conMessenger || (
    ipMode === "restrict" && parseIps().length > 0 && !ipsConRango &&
    (modalMode === "edit" ? true : confirmaMessenger && DIAS_MESSENGER.includes(expiryDays))
  );
  const canSubmit = name.trim() && scopes.length > 0 && !submitting &&
    (ipMode === "none" || parseIps().length > 0) && reglasMessengerOk;

  return (
    <div className="space-y-5 p-6 lg:p-8">
      {/* Header */}
      <PageHeader
        title="API keys"
        subtitle="Acceso programático de solo-lectura a los datos de Maven (creadoras, empleados, ventas)."
        icon={<KeyRound />}
        actions={
          <>
            <Button variant="outline" className="gap-1.5" onClick={() => setDocsOpen(true)}>
              <BookOpen className="h-4 w-4" /> API reference
            </Button>
            <Button className="gap-1.5" onClick={openCreate} disabled={atLimit}
              title={atLimit ? `Máximo ${maxActive} keys activas` : undefined}>
              <Plus className="h-4 w-4" /> Create API key
            </Button>
          </>
        }
      />

      {/* Banner de aviso */}
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="flex gap-3 p-4 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="space-y-0.5 text-muted-foreground">
            <p><span className="font-medium text-foreground">Uso interno.</span> No compartas las API keys con proveedores externos ni las publiques.</p>
            <p>Puedes tener hasta <span className="font-medium text-foreground">{maxActive} keys activas</span> a la vez ({activeCount}/{maxActive} en uso).</p>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : isError ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
            <ShieldAlert className="h-4 w-4" /> {(error as Error)?.message ?? "Error al cargar las keys"}
          </CardContent>
        </Card>
      ) : keys.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Todavía no hay API keys. Creá la primera con “Create API key”.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="tabla-movil w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">API key</th>
                  <th className="px-4 py-3 font-medium">Creada</th>
                  <th className="px-4 py-3 font-medium">Creada por</th>
                  <th className="px-4 py-3 font-medium" title="La key opera a nombre de esta persona (GET /me) y deja de funcionar si la dan de baja. No cambia nunca. Los datos se entregan según los permisos (scopes) de la key, no según los de esta persona.">Actúa como</th>
                  <th className="px-4 py-3 font-medium">IP whitelist</th>
                  <th className="px-4 py-3 font-medium">Expira</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className={`border-b border-border/40 ${k.status !== "active" ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3 font-medium">
                      {k.name}
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {k.scopes.map((s) => <Badge key={s} variant="secondary" className="font-normal text-[10px]">{s}</Badge>)}
                      </div>
                    </td>
                    <td className="px-4 py-3"><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{k.key_prefix}…{k.last_four ?? ""}</code></td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmt(k.created_at, f.intl("es-CO"))}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{k.created_by_email ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{k.acts_as ? (k.acts_as.name ?? "—") : "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {k.ip_whitelist?.length ? (
                        <span title={k.ip_whitelist.join(", ")}>{k.ip_whitelist.length} IP{k.ip_whitelist.length > 1 ? "s" : ""}</span>
                      ) : <span className="text-muted-foreground/70">Sin restricción</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{k.expires_at ? fmt(k.expires_at, f.intl("es-CO")) : "Nunca"}</td>
                    <td className="px-4 py-3">
                      {k.status === "active" && k.acts_as?.active === false && (
                        <Badge variant="outline" className="border-destructive/40 text-destructive"
                          title="La persona como la que actúa esta key fue dada de baja o ya no está en la agencia: el API la rechaza con 401. Revocala y creá otra.">
                          Persona dada de baja
                        </Badge>
                      )}
                      {k.status === "active" && k.acts_as?.active === true && <Badge variant="outline" className="border-success/40 text-success">Activa</Badge>}
                      {k.status === "active" && (k.acts_as?.active ?? null) === null && (
                        <Badge variant="outline" className="text-muted-foreground"
                          title="No se pudo verificar si la persona como la que actúa esta key sigue activa. Recargá la página.">
                          Activa · sin verificar
                        </Badge>
                      )}
                      {k.status === "revoked" && <Badge variant="outline" className="border-destructive/40 text-destructive">Revocada</Badge>}
                      {k.status === "expired" && <Badge variant="outline" className="text-muted-foreground">Vencida</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {k.status === "active" && (
                          <>
                            {!(k.scopes.includes(SCOPE_MESSENGER) && data?.you?.id && k.acts_as?.id !== data.you.id) && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(k)} title="Editar">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setRevokeTarget(k)} title="Revocar">
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

      {/* Modal crear / editar / mostrar key */}
      <Dialog open={modalMode !== null} onOpenChange={(o) => { if (!o) closeModal(); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {freshKey ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Check className="h-5 w-5 text-success" /> Key creada</DialogTitle>
                <DialogDescription>
                  Copiala ahora. <strong className="text-foreground">No la vas a volver a ver</strong> — Maven solo guarda un hash.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
                  <code className="block break-all font-mono text-sm text-foreground">{freshKey}</code>
                </div>
                <div className="flex justify-end"><CopyButton text={freshKey} label="Copiar la key" /></div>
              </div>
              <DialogFooter><Button onClick={closeModal}>Listo, ya la copié</Button></DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{modalMode === "edit" ? "Editar API key" : "Create API key"}</DialogTitle>
                <DialogDescription>
                  Nombre, IPs permitidas, expiración y permisos.
                  {modalMode !== "edit" && " La key va a actuar como vos, y eso no se puede cambiar después."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5">
                {/* Nombre */}
                <div className="space-y-1.5">
                  <Label htmlFor="key-name">Nombre</Label>
                  <Input id="key-name" placeholder="Ej: Integración Álvaro" value={name}
                    onChange={(e) => setName(e.target.value)} autoFocus />
                </div>

                {/* IP whitelist */}
                <div className="space-y-2">
                  <Label>IP whitelist</Label>
                  {!conMessenger && (
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                      <input type="radio" className="mt-1 accent-primary" checked={ipMode === "none"} onChange={() => setIpMode("none")} />
                      <span><span className="font-medium">Sin restricción</span><span className="block text-xs text-muted-foreground">Acceso desde cualquier IP.</span></span>
                    </label>
                  )}
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                    <input type="radio" className="mt-1 accent-primary" checked={ipMode === "restrict"} onChange={() => setIpMode("restrict")} />
                    <span><span className="font-medium">Restringir a IPs de confianza</span><span className="block text-xs text-muted-foreground">Solo estas IPs/CIDR pueden usar la key.</span></span>
                  </label>
                  {ipMode === "restrict" && (
                    <textarea
                      className="min-h-[64px] w-full rounded-md border border-border/60 bg-background p-2 text-sm"
                      placeholder={conMessenger ? "Una por línea, IPs exactas, ej:\n45.225.224.129" : "Una por línea, ej:\n45.225.224.129\n190.0.0.0/24"}
                      value={ipText} onChange={(e) => setIpText(e.target.value)} />
                  )}
                  {conMessenger && (
                    <p className={`text-xs ${ipsConRango ? "text-destructive" : "text-muted-foreground"}`}>
                      Con Messenger van IPs exactas del servidor de la integración, sin rangos (/). Desde una laptop o una casa la IP cambia y la key deja de funcionar.
                    </p>
                  )}
                </div>

                {/* Expiración */}
                <div className="space-y-1.5">
                  <Label>Expiración</Label>
                  <div className="flex flex-wrap gap-2">
                    {modalMode === "edit" && (
                      <button type="button" onClick={() => setExpiryDays(-1)}
                        className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${expiryDays === -1 ? "border-primary bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:bg-muted/30"}`}>
                        Mantener actual
                      </button>
                    )}
                    {EXPIRY_OPTIONS
                      // Con Messenger: 90 días como máximo al crear, y al editar solo se
                      // mantiene (renovarla es crear otra).
                      .filter((o) => !conMessenger || (modalMode === "create" && DIAS_MESSENGER.includes(o.days)))
                      .map((o) => (
                      <button key={o.days} type="button" onClick={() => setExpiryDays(o.days)}
                        className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${expiryDays === o.days ? "border-primary bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:bg-muted/30"}`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* API scopes agrupados */}
                <div className="space-y-3">
                  <Label>API scopes</Label>
                  {groups.map((group) => {
                    const items = catalog.filter((s) => s.group === group);
                    if (!items.length) return null;
                    return (
                      <div key={group} className="rounded-lg border border-border/60 bg-muted/10 p-3">
                        <div className="mb-2 text-sm font-semibold">{group}</div>
                        <div className="space-y-1.5">
                          {items.map((s) => {
                            const bloqueado = s.key === SCOPE_MESSENGER && modalMode === "edit" && !teniaMessenger;
                            return (
                            <label key={s.key}
                              className={`flex items-start gap-2.5 rounded-md p-1.5 ${bloqueado ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/30"}`}
                              title={bloqueado ? "El Messenger solo se puede poner al crear una key nueva" : undefined}>
                              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" disabled={bloqueado}
                                checked={scopes.includes(s.key)} onChange={() => toggleScope(s.key)} />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium">{s.label}</span>
                                  <span className="shrink-0 text-xs text-muted-foreground">Solo lectura</span>
                                </span>
                                <span className="block text-xs text-muted-foreground">{s.description}</span>
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
              </div>
              {conMessenger && modalMode === "create" && (
                <div className="mt-4 space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <p className="font-medium text-foreground">
                    Esta key va a leer TODAS las conversaciones del Messenger de {yoNombre}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Directas y grupos, también las futuras, con los mensajes que te mandan otras personas: exactamente lo que ves en /messenger. Quien tenga la key las lee desde las IPs que pongas, hasta que venza o la revoques. No marca nada como leído.
                  </p>
                  <label className="flex cursor-pointer items-start gap-2 text-xs">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-destructive"
                      checked={confirmaMessenger} onChange={(e) => setConfirmaMessenger(e.target.checked)} />
                    <span>Entiendo que la key lee mis conversaciones y las de quienes me escriben.</span>
                  </label>
                </div>
              )}
              <DialogFooter>
                <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
                <Button className="gap-1.5" disabled={!canSubmit}
                  onClick={() => (modalMode === "edit" ? updateMut.mutate() : createMut.mutate())}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {modalMode === "edit" ? "Guardar" : "Crear key"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* API reference */}
      <Dialog open={docsOpen} onOpenChange={setDocsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> API reference</DialogTitle>
            <DialogDescription>Solo-lectura. Autenticación por API key.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div>
              <div className="mb-1 font-medium">Base URL</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-md border border-border/60 bg-background px-3 py-2 text-xs">{API_BASE}</code>
                <CopyButton text={API_BASE} label="Copiar" />
              </div>
            </div>
            <div>
              <div className="mb-1 font-medium">Autenticación</div>
              <p className="text-xs text-muted-foreground">Envía la key en <code className="rounded bg-muted px-1 py-0.5">Authorization: Bearer mvk_live_…</code> (o el header <code className="rounded bg-muted px-1 py-0.5">X-API-Key</code>).</p>
              <p className="mt-1 text-xs text-muted-foreground">Cada key opera a nombre de una persona de Maven (quien la creó) y eso no cambia nunca. Si esa persona deja Maven o la agencia, la key deja de funcionar (401). <code className="rounded bg-muted px-1 py-0.5">GET /me</code> dice cuál es. Los datos se entregan según los scopes de la key.</p>
            </div>
            <div>
              <div className="mb-1 font-medium">Límite</div>
              <p className="text-xs text-muted-foreground">
                1.000 pedidos por hora y 60 por minuto por key; la hora se reinicia en punto. Las respuestas a una key válida traen <code className="rounded bg-muted px-1 py-0.5">X-RateLimit-Limit</code>, <code className="rounded bg-muted px-1 py-0.5">X-RateLimit-Remaining</code> y <code className="rounded bg-muted px-1 py-0.5">X-RateLimit-Reset</code> (epoch en segundos), que son los de la hora. Pasado cualquiera de los dos límites: <code className="rounded bg-muted px-1 py-0.5">429</code> con <code className="rounded bg-muted px-1 py-0.5">Retry-After</code> (segundos).
              </p>
            </div>
            <div>
              <div className="mb-1 font-medium">Ejemplo</div>
              <div className="rounded-md border border-border/60 bg-background p-3">
                <pre className="overflow-x-auto text-[11px] leading-relaxed">{`curl "${API_BASE}/creators?status=active&limit=100" \\
  -H "Authorization: Bearer mvk_live_..."`}</pre>
              </div>
            </div>
            <div>
              <div className="mb-2 font-medium">Endpoints</div>
              <div className="space-y-2 text-xs">
                {([
                  { m: "GET", p: "/me", s: null, d: "Como quién actúa esta key (acts_as: id, name, avatar_url), su agencia (agency_id) y el cupo que le queda esta hora (rate_limit). No necesita scope." },
                  { m: "GET", p: "/messenger/conversations", s: "messenger:read", d: "La bandeja de la persona de la key, como en /messenger: cada conversación con type (direct | group), counterpart (en las directas), last_message (text_preview de 200 caracteres), unread_count (tope 100; null si no se pudo contar), me (su rol, last_read_at, silenciada), is_pinned, is_archived. Ordenada por última actividad. Filtros: limit (máx 100), offset. No es para sondear: para lo nuevo, /messenger/feed." },
                  { m: "GET", p: "/messenger/conversations/{id}", s: "messenger:read", d: "Una conversación: datos, settings del grupo, me y participants (user, role, joined_at). Si el grupo esconde la lista de miembros y la persona no es admin del grupo, participants = null y participants_hidden = true. Si no la ve, 404." },
                  { m: "GET", p: "/messenger/conversations/{id}/messages", s: "messenger:read", d: "La historia, de lo más nuevo a lo más viejo, con cursor: pasá next_cursor en before para la página anterior, o usá after para pedir lo nuevo en orden. Cada mensaje: sender, kind (text | image | gif | video | voice_note | audio | file | system), text, attachment (url, name, hosted_by, storage_path), reply_to_id, is_thread_reply, is_edited, is_deleted. Un borrado viene sin texto ni adjunto. Filtros: limit (máx 100), before | after, thread_root_id, include=rich (agrega el texto con formato)." },
                  { m: "GET", p: "/messenger/feed", s: "messenger:read", d: "Lo nuevo en TODAS las conversaciones, en orden: así recibe mensajes una integración sin webhooks. Primer pedido con since (ISO, 72 h como máximo) o sin nada (últimos 15 min); después, siempre after=next_cursor. Si caught_up = true, esperá 30 s o más antes del próximo. Mira como mucho una hora por pedido. exclude_own=true saca lo que mandó la propia persona. Solo mensajes nuevos: ediciones y borrados se ven releyendo la conversación." },
                  { m: "GET", p: "/creators", s: "creators:read", d: "Creadoras + redes (IG, TikTok, X, OnlyFans, Telegram…). Filtros: status, limit, offset." },
                  { m: "GET", p: "/creators/{id}", s: "creators:read", d: "Detalle de una creadora." },
                  { m: "GET", p: "/contacts", s: "contacts:read", d: "Directorio comercial. Filtros: kind (modelo|agencia|ex_creadora), status, country, con_telefono, limit, offset. Teléfono y email enmascarados salvo que la key tenga contacts:phone." },
                  { m: "GET", p: "/contacts/{id}", s: "contacts:read", d: "Detalle de un contacto." },
                  { m: "GET", p: "/employees", s: "employees:read", d: "Roster del equipo (nombre, rol). Filtro: role." },
                  { m: "GET", p: "/hubstaff", s: "hubstaff:read", d: "Horas diarias de Hubstaff por empleado (horas, actividad, proyecto). Filtros: from, to, profile_id." },
                  { m: "GET", p: "/cowork/time", s: "cowork:read", d: "Tiempo en Cowork por empleado y día: active_seconds (lo que exige la sesión, presente; incluye el meet grupal), group_meet_seconds, paused_seconds, bathroom_breaks / bathroom_seconds / bathroom_exceeded (presupuesto del día), breaks / break_seconds / breaks_exceeded / break_excess_seconds (tope por pausa), no_camera_seconds, no_screen_seconds, away_seconds, in_room_seconds, sessions, first_join, last_leave. Filtros: from, to, profile_id." },
                  { m: "GET", p: "/cowork/time/segments", s: "cowork:read", d: "Cada tramo del reloj al detalle: state (active | group_meet | paused | no_camera | no_screen | away), detail, started_at, ended_at, seconds, sesión y sala. Filtros: from, to, profile_id." },
                  { m: "GET", p: "/cowork/breaks", s: "cowork:read", d: "Cada pausa al detalle: kind (bathroom | break), started_at, ended_at, seconds, limit_seconds (tope vigente de la sesión), exceeded, auto_closed (la cerró el sistema: cerró la pestaña), sesión y sala. Filtros: from, to, profile_id." },
                  { m: "GET", p: "/cowork/meets", s: "cowork:read", d: "Cada meet grupal: una fila por persona y meet (meet_id, invoked_by / invoked_by_name, meet_started_at, meet_ended_at, meet_end_reason, room_name de donde vino, joined_at, left_at, seconds, left_reason). Ese tiempo cuenta como trabajado y ya está dentro de active_seconds en /cowork/time. Filtros: from, to, profile_id." },
                  { m: "GET", p: "/sales", s: "sales:read", d: "Ganancias diarias por creadora + desglose. Filtros: from, to, creator_id." },
                  { m: "GET", p: "/sales/chatters", s: "sales:chatters", d: "Ventas diarias por chatter. Filtros: from, to." },
                  { m: "GET", p: "/promolog", s: "promolog:read", d: "Promoción diaria por creadora y red (promovió sí/no, historias). Filtros: from, to, creator_id, network." },
                ] as { m: string; p: string; s: string | null; d: string }[]).map((e) => (
                  <div key={e.p} className="rounded-md border border-border/60 p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">{e.m}</Badge>
                      <code className="font-medium">{e.p}</code>
                      {e.s && <Badge variant="secondary" className="font-normal text-[10px]">{e.s}</Badge>}
                    </div>
                    <p className="mt-1 text-muted-foreground">{e.d}</p>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Paginación: <code className="rounded bg-muted px-1 py-0.5">limit</code> (máx 500) + <code className="rounded bg-muted px-1 py-0.5">offset</code>. Cada respuesta trae <code className="rounded bg-muted px-1 py-0.5">count</code> total. En el Messenger los mensajes van con cursor (<code className="rounded bg-muted px-1 py-0.5">next_cursor</code>, máx 100 por página) y sin count. Las keys con Messenger exigen IPs fijas y vencimiento; los adjuntos son links públicos permanentes: cualquiera que tenga el link lo abre, aunque la key se revoque.
            </p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDocsOpen(false)}>Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar revocar */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => { if (!o) setRevokeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Revocar “{revokeTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              La key deja de funcionar inmediatamente y cualquier integración que la use empezará a recibir 401. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => revokeTarget && revokeMut.mutate(revokeTarget.id)}>
              {revokeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Revocar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminApiKeys;
