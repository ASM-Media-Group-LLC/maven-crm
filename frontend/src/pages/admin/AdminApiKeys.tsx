import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Copy, Check, Loader2, ShieldAlert, Trash2, BookOpen } from "lucide-react";
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

// Settings → Administración → API keys (SOLO admins).
// Crea/lista/revoca keys de la API pública de Maven. El secreto completo se
// muestra UNA sola vez al crear; después solo queda el prefijo + hash.

type ScopeDef = { key: string; label: string; description: string };
type ApiKey = {
  id: string; name: string; key_prefix: string; scopes: string[];
  created_at: string; created_by_email: string | null;
  last_used_at: string | null; request_count: number;
  expires_at: string | null; revoked_at: string | null;
  status: "active" | "revoked" | "expired";
};

const FALLBACK_SCOPES: ScopeDef[] = [
  { key: "creators:read", label: "Creadoras — lectura", description: "Roster de creadoras y sus redes sociales." },
];

const API_BASE =
  `${import.meta.env.VITE_SUPABASE_URL ?? "https://lsagslbkliprespbyhts.supabase.co"}/functions/v1/public-api`;

const EXPIRY_OPTIONS = [
  { label: "Nunca", days: 0 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
  { label: "1 año", days: 365 },
];

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button" variant="outline" size="sm" className="gap-1.5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          toast.success("Copiado al portapapeles");
          setTimeout(() => setDone(false), 2000);
        } catch {
          toast.error("No pude copiar — copiala manualmente");
        }
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Copiado" : label}
    </Button>
  );
}

const AdminApiKeys = () => {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["creators:read"]);
  const [expiryDays, setExpiryDays] = useState(0);
  // La key recién creada (se muestra una única vez).
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => adminInvoke<{ keys: ApiKey[]; scope_catalog: ScopeDef[] }>("manage-api-keys", { action: "list" }),
  });

  const keys = data?.keys ?? [];
  const scopeCatalog = useMemo<ScopeDef[]>(
    () => (data?.scope_catalog?.length ? data.scope_catalog : FALLBACK_SCOPES),
    [data],
  );

  const createMut = useMutation({
    mutationFn: async () => {
      const expires_at = expiryDays > 0
        ? new Date(Date.now() + expiryDays * 86400_000).toISOString()
        : null;
      return adminInvoke<{ key: string }>("manage-api-keys", {
        action: "create", name: name.trim(), scopes: selectedScopes, expires_at,
      });
    },
    onSuccess: (res) => {
      setFreshKey(res.key);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key creada");
    },
    onError: (e) => toast.error((e as Error)?.message ?? "No pude crear la key"),
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => adminInvoke("manage-api-keys", { action: "revoke", id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key revocada");
      setRevokeTarget(null);
    },
    onError: (e) => toast.error((e as Error)?.message ?? "No pude revocar la key"),
  });

  const openCreate = () => {
    setName(""); setSelectedScopes(["creators:read"]); setExpiryDays(0); setFreshKey(null);
    setCreateOpen(true);
  };
  const closeCreate = () => { setCreateOpen(false); setFreshKey(null); };

  const toggleScope = (k: string) =>
    setSelectedScopes((prev) => prev.includes(k) ? prev.filter((s) => s !== k) : [...prev, k]);

  return (
    <div className="space-y-5 p-6 lg:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <KeyRound className="h-6 w-6 text-primary" /> API keys
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Acceso programático de solo-lectura a los datos de Maven. Cada key lleva permisos (scopes)
            acotados. El secreto se muestra una sola vez al crearla — guardalo en un lugar seguro.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" /> Nueva API key
        </Button>
      </div>

      {/* Docs */}
      <Card className="border-border/60 bg-muted/10">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-4 w-4 text-muted-foreground" /> Cómo usarla
          </div>
          <p className="text-xs text-muted-foreground">
            Mandá la key en el header <code className="rounded bg-muted px-1 py-0.5">Authorization: Bearer</code>.
            Base URL:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md border border-border/60 bg-background px-3 py-2 text-xs">
              {API_BASE}
            </code>
            <CopyButton text={API_BASE} />
          </div>
          <div className="rounded-md border border-border/60 bg-background p-3">
            <pre className="overflow-x-auto text-[11px] leading-relaxed text-foreground">
{`curl "${API_BASE}/creators?status=active&limit=100" \\
  -H "Authorization: Bearer mvk_live_..."`}
            </pre>
          </div>
          <p className="text-xs text-muted-foreground">
            Devuelve las creadoras con sus redes (Instagram, TikTok, Twitter/X, OnlyFans, Telegram…).
            También <code className="rounded bg-muted px-1 py-0.5">/creators/&#123;id&#125;</code> para el detalle.
          </p>
        </CardContent>
      </Card>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : isError ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
            <ShieldAlert className="h-4 w-4" /> {(error as Error)?.message ?? "Error al cargar las keys"}
          </CardContent>
        </Card>
      ) : keys.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Todavía no hay API keys. Creá la primera con “Nueva API key”.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <Card key={k.id} className="border-border/60">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{k.name}</span>
                    {k.status === "active" && <Badge variant="outline" className="border-success/40 text-success">Activa</Badge>}
                    {k.status === "revoked" && <Badge variant="outline" className="border-destructive/40 text-destructive">Revocada</Badge>}
                    {k.status === "expired" && <Badge variant="outline" className="text-muted-foreground">Vencida</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5">{k.key_prefix}…</code>
                    {k.scopes.map((s) => <Badge key={s} variant="secondary" className="font-normal">{s}</Badge>)}
                  </div>
                  <div className="flex flex-wrap gap-x-4 text-[11px] text-muted-foreground">
                    <span>Creada {fmt(k.created_at)}{k.created_by_email ? ` · ${k.created_by_email}` : ""}</span>
                    <span>Último uso: {fmt(k.last_used_at)}</span>
                    <span>{k.request_count} requests</span>
                    {k.expires_at && <span>Expira {fmt(k.expires_at)}</span>}
                  </div>
                </div>
                {k.status === "active" && (
                  <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => setRevokeTarget(k)}>
                    <Trash2 className="h-3.5 w-3.5" /> Revocar
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog crear / mostrar key */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) closeCreate(); }}>
        <DialogContent className="sm:max-w-lg">
          {freshKey ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-success" /> Key creada
                </DialogTitle>
                <DialogDescription>
                  Copiala ahora. <strong className="text-foreground">No la vas a volver a ver</strong> —
                  Maven solo guarda un hash.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
                  <code className="block break-all font-mono text-sm text-foreground">{freshKey}</code>
                </div>
                <div className="flex justify-end">
                  <CopyButton text={freshKey} label="Copiar la key" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={closeCreate}>Listo, ya la copié</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Nueva API key</DialogTitle>
                <DialogDescription>Elegí un nombre, los permisos y (opcional) cuándo expira.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="key-name">Nombre</Label>
                  <Input id="key-name" placeholder="Ej: Integración Álvaro" value={name}
                    onChange={(e) => setName(e.target.value)} autoFocus />
                </div>
                <div className="space-y-2">
                  <Label>Permisos</Label>
                  {scopeCatalog.map((s) => (
                    <label key={s.key}
                      className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border/60 p-2.5 hover:bg-muted/30">
                      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary"
                        checked={selectedScopes.includes(s.key)} onChange={() => toggleScope(s.key)} />
                      <span className="space-y-0.5">
                        <span className="block text-sm font-medium">{s.label}</span>
                        <span className="block text-xs text-muted-foreground">{s.description}</span>
                        <code className="text-[10px] text-muted-foreground">{s.key}</code>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <Label>Expiración</Label>
                  <div className="flex flex-wrap gap-2">
                    {EXPIRY_OPTIONS.map((o) => (
                      <button key={o.days} type="button" onClick={() => setExpiryDays(o.days)}
                        className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                          expiryDays === o.days
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border/60 text-muted-foreground hover:bg-muted/30"}`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={closeCreate}>Cancelar</Button>
                <Button
                  onClick={() => createMut.mutate()}
                  disabled={!name.trim() || selectedScopes.length === 0 || createMut.isPending}
                  className="gap-1.5">
                  {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Crear key
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmar revocar */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => { if (!o) setRevokeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Revocar “{revokeTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              La key deja de funcionar inmediatamente. Cualquier integración que la use va a empezar a
              recibir 401. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
