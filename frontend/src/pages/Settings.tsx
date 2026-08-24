import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserAvatar } from "@/components/UserAvatar";
import {
  Rocket,
  Shield,
  ClipboardCheck,
  Palette,
  FileText,
  Map,
  ChevronRight,
  ArrowLeft,
  Camera,
  Loader2,
  KeyRound,
  LogOut,
  User as UserIcon,
  Send,
  MessageCircle,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PhoneInput } from "@/components/ui/phone-input";
// Sub-páginas que antes se navegaban como rutas separadas (perdiendo el
// rail de Settings). Ahora se renderizan embebidas en el panel derecho
// vía ?sub=<key>.
import AdminUsuarios from "@/pages/admin/AdminUsuarios";
import AuditoriaRoles from "@/pages/admin/AuditoriaRoles";
import AdminReportes from "@/pages/admin/AdminReportes";
import DesignSystem from "@/pages/DesignSystem";
import Docs from "@/pages/Docs";
import Roadmap from "@/pages/Roadmap";
import { toast } from "sonner";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useLanguage } from "@/hooks/useLanguage";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile, useRequestWhatsappVerification, useUpdateMyPhone, useUploadUserAvatar, type VerificationCode, useSaveAvatarSeed, useRemoveUserAvatar } from "@/hooks/useUserProfile";
import ChangePasswordModal from "@/components/dashboard/ChangePasswordModal";

// Settings page — left rail with the user's role banner + tab list,
// right side renders the active section. Layout matches the screenshot
// the user shared (KASH "Role settings" page).

type TabKey = "account" | "mp" | "admin" | "resources";

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const Row = ({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) => (
  <Link
    to={to}
    className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/50 hover:bg-muted/50"
  >
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
      <Icon className="h-4 w-4" />
    </span>
    <div className="min-w-0 flex-1">
      <div className="text-sm font-medium">{title}</div>
      {description && (
        <div className="truncate text-xs text-muted-foreground">{description}</div>
      )}
    </div>
    <ChevronRight className="h-4 w-4 text-muted-foreground" />
  </Link>
);

const MyAccountTab = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const profileQ = useMyProfile();
  const upload = useUploadUserAvatar();
  const saveSeed = useSaveAvatarSeed();
  const removeAvatar = useRemoveUserAvatar();
  const [seedDraft, setSeedDraft] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pwOpen, setPwOpen] = useState(false);

  const fullName = user?.user_metadata?.full_name || profileQ.data?.full_name || t("settings.defaultUser");
  const email = user?.email || "";
  const avatarUrl = profileQ.data?.avatar_url ?? null;

  const handleFile = async (file: File) => {
    try {
      await upload.mutateAsync(file);
      toast.success(t("settings.photoUpdated"));
    } catch (e) {
      toast.error(t("settings.couldNotUpload"), { description: (e as Error).message });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.myAccount")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("settings.myAccountDesc")}
        </p>
      </div>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-5">
            <div className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-full">
              <UserAvatar
                name={fullName}
                src={avatarUrl}
                seed={profileQ.data?.avatar_seed}
                className="h-full w-full"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={upload.isPending}
                className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 text-white opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-100"
                aria-label={t("settings.changePhotoAria")}
              >
                {upload.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-[10px]">{t("settings.uploading")}</span>
                  </>
                ) : (
                  <>
                    <Camera className="h-5 w-5" />
                    <span className="text-[10px]">{t("settings.change")}</span>
                  </>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold truncate">{fullName}</div>
              <div className="truncate text-sm text-muted-foreground">{email}</div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("settings.hoverToUpload")}
              </p>
              {avatarUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                  disabled={removeAvatar.isPending}
                  onClick={async () => {
                    try {
                      await removeAvatar.mutateAsync();
                      toast.success(t("settings.photoRemoved"), { description: t("settings.photoRemovedDesc") });
                    } catch (e) {
                      toast.error(t("settings.couldNotRemove"), { description: (e as Error).message });
                    }
                  }}
                >
                  {t("settings.removePhoto")}
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Picker de muñequito: si el usuario no tiene foto, su avatar es un
          muñequito determinista. Acá puede "mezclar" variantes y guardar la
          que le guste (profiles.avatar_seed). La foto real siempre gana. */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-5">
            <UserAvatar
              name={fullName}
              seed={seedDraft ?? profileQ.data?.avatar_seed ?? user?.id}
              size="xl"
              ring
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold">{t("settings.doodleTitle")}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("settings.doodleDesc")}
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSeedDraft(`${user?.id ?? "seed"}:${Math.random().toString(36).slice(2, 8)}`)
                  }
                >
                  {t("settings.shuffle")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!seedDraft || saveSeed.isPending}
                  onClick={async () => {
                    if (!seedDraft) return;
                    try {
                      await saveSeed.mutateAsync(seedDraft);
                      setSeedDraft(null);
                      toast.success(t("settings.doodleSaved"));
                    } catch (e) {
                      toast.error(t("settings.couldNotSave"), { description: (e as Error).message });
                    }
                  }}
                >
                  {t("settings.saveThisOne")}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <WhatsappPhoneCard
        currentValue={profileQ.data?.phone_e164 ?? null}
        verifiedAt={profileQ.data?.whatsapp_verified_at ?? null}
        pushName={profileQ.data?.whatsapp_push_name ?? null}
        loading={profileQ.isLoading}
      />

      <Card>
        <CardContent className="p-6">
          <div className="mb-3 text-sm font-semibold">{t("settings.security")}</div>
          <Button variant="outline" onClick={() => setPwOpen(true)} className="gap-2">
            <KeyRound className="h-4 w-4" />
            {t("topbar.changePassword")}
          </Button>
        </CardContent>
      </Card>

      <ChangePasswordModal open={pwOpen} onOpenChange={setPwOpen} />
    </div>
  );
};

// WhatsApp phone card — sección dentro de "Mi cuenta" donde el user
// carga su número de WhatsApp con un picker de país (banderas + búsqueda
// por nombre o código). Al guardar normalizamos a E.164 puro (sin espacios)
// porque el CHECK constraint en DB exige `^\+[0-9]{8,16}$`.
//
// Por qué importa: el bot de WhatsApp usa last-10-digits matching (RPC
// whatsapp_resolve_user_by_phone) para auto-linkear al user de Maven con
// el wpp_member del grupo. Sin esto, un admin tendría que linkear a cada
// miembro a mano desde Panel de Control → Bot WhatsApp.
//
// El componente PhoneInput maneja el value como "+57 3001234567" (con
// espacio entre código y número). Al guardar le sacamos el espacio.
const WhatsappPhoneCard = ({
  currentValue,
  verifiedAt,
  pushName,
  loading,
}: {
  currentValue: string | null;
  verifiedAt: string | null;
  pushName: string | null;
  loading: boolean;
}) => {
  const { t } = useLanguage();
  // El componente PhoneInput maneja value como "+<code> <number>". Al
  // hidratar desde el backend (que guarda "+573001234567" sin espacio)
  // el parsePhone interno se encarga de separar code de número, así que
  // pasarle el value tal cual funciona.
  const [value, setValue] = useState("");
  const [dirty, setDirty] = useState(false);
  // Código de verificación vigente (flujo iniciado por el usuario: él le manda
  // el código al bot — el bot NO manda DMs en frío, eso tumbó la línea el 20/7).
  const [verif, setVerif] = useState<VerificationCode | null>(null);
  const updateMut = useUpdateMyPhone();
  const requestMut = useRequestWhatsappVerification();

  useEffect(() => {
    if (!dirty) setValue(currentValue ?? "");
  }, [currentValue, dirty]);

  // E.164 puro: solo `+` y dígitos. Sacamos espacios/guiones/paréntesis.
  const toE164 = (raw: string): string => raw.replace(/[^\d+]/g, "");

  const handleSave = async () => {
    const trimmed = value.trim();
    if (trimmed === "" || trimmed === "+") {
      try {
        await updateMut.mutateAsync(null);
        toast.success(t("settings.waRemoved"));
        setDirty(false);
      } catch (e) {
        toast.error(t("settings.couldNotSave"), { description: (e as Error).message });
      }
      return;
    }
    const normalized = toE164(trimmed);
    if (!/^\+[0-9]{8,16}$/.test(normalized)) {
      toast.error(t("settings.waInvalidNumber"), {
        description: t("settings.waInvalidNumberDesc"),
      });
      return;
    }
    try {
      await updateMut.mutateAsync(normalized);
      setValue(normalized);
      setDirty(false);
      toast.success(t("settings.waSaved"), {
        description: t("settings.waSavedDesc"),
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("duplicate") || msg.includes("unique")) {
        toast.error(t("settings.waDuplicate"), {
          description: t("settings.waDuplicateDesc"),
        });
      } else if (msg.includes("phone_e164_format") || msg.includes("check")) {
        toast.error(t("settings.waBadFormat"), {
          description: t("settings.waBadFormatDesc"),
        });
      } else {
        toast.error(t("settings.couldNotSave"), { description: msg });
      }
    }
  };

  const isLinked = Boolean(currentValue);
  const isVerified = Boolean(verifiedAt);
  const hasChanges = dirty && toE164(value) !== (currentValue ?? "");

  // Genera el código y abre WhatsApp con el mensaje pre-escrito hacia el bot.
  // VOS iniciás el chat (el bot nunca escribe primero a un número nuevo).
  const handleVerify = async () => {
    try {
      const data = await requestMut.mutateAsync();
      setVerif(data);
      window.open(data.wa_link, "_blank", "noopener,noreferrer");
      toast.success(t("settings.waCodeGenerated"), {
        description: t("settings.waCodeGeneratedDesc"),
      });
    } catch (e) {
      toast.error(t("settings.waCodeError"), { description: (e as Error).message });
    }
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <MessageCircle className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{t("settings.waTitle")}</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("settings.waDesc")}
            </p>
          </div>
          {isLinked && isVerified && (
            <Badge variant="default" className="gap-1 text-[10px] bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 className="h-2.5 w-2.5" /> {t("settings.waVerified")}
            </Badge>
          )}
          {isLinked && !isVerified && (
            <Badge variant="outline" className="gap-1 text-[10px] border-amber-500 text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-2.5 w-2.5" /> {t("settings.waPending")}
            </Badge>
          )}
        </div>

        <div className="grid gap-2 max-w-md">
          <Label htmlFor="phone_e164" className="text-xs">
            {t("settings.waYourNumber")}
          </Label>
          <div className="flex gap-2">
            <PhoneInput
              value={value}
              onChange={(v) => {
                setValue(v);
                setDirty(true);
              }}
              disabled={loading || updateMut.isPending}
              className="flex-1"
            />
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updateMut.isPending}
              className="shrink-0"
            >
              {updateMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("settings.waSave")
              )}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              {t("settings.waPrivacyNote")}
            </span>
          </p>
        </div>

        {/* Estado de verificación cuando ya hay número guardado. El flujo lo inicia
            SIEMPRE el usuario: genera un código y se lo manda al bot por WhatsApp
            (botón wa.me pre-escrito). El bot no manda DMs en frío. */}
        {isLinked && (
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2 max-w-md">
            {isVerified ? (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="font-medium">
                    {t("settings.waVerifiedAs")} <span className="text-emerald-600">{pushName ?? t("settings.waNoPushName")}</span>
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t("settings.waVerifiedHint")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleVerify}
                  disabled={requestMut.isPending}
                  className="h-7 text-xs"
                >
                  {requestMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                  {t("settings.waReverify")}
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <span className="font-medium">{t("settings.waNeedsVerify")}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t("settings.waNeedsVerifyHint1")}{" "}
                  <strong>{t("settings.waBotName")}</strong>{t("settings.waNeedsVerifyHint2")}
                </p>
                <Button
                  size="sm"
                  onClick={handleVerify}
                  disabled={requestMut.isPending}
                  className="h-8 text-xs"
                >
                  {requestMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <MessageCircle className="h-3 w-3 mr-1" />}
                  {t("settings.waVerify")}
                </Button>
                {verif && (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 space-y-1">
                    <p className="text-[11px] text-muted-foreground">
                      {t("settings.waYourCode")} <code className="px-1.5 py-0.5 rounded bg-muted font-semibold tracking-widest">{verif.code}</code>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {t("settings.waNotOpened")}{" "}
                      <a
                        href={verif.wa_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-emerald-600"
                      >
                        {t("settings.waOpenAgain")}
                      </a>{" "}
                      {t("settings.waSendManually", { phone: `+${verif.bot_phone}` })}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const ProyectoMPTab = () => {
  const { t } = useLanguage();
  return (
  <div className="space-y-4">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t("settings.mpTitle")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("settings.mpDesc")}
      </p>
    </div>
    <Card>
      <CardContent className="space-y-2 p-4">
        <Row
          to="/proyectomp"
          icon={Rocket}
          title={t("settings.mpOpen")}
          description={t("settings.mpOpenDesc")}
        />
      </CardContent>
    </Card>
  </div>
  );
};

const AdminTab = ({ canAccess, isAdmin }: { canAccess: ReturnType<typeof usePermissions>["canAccess"]; isAdmin: boolean }) => {
  const { t } = useLanguage();
  return (
  <div className="space-y-4">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t("settings.adminTitle")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("settings.adminDesc")}
      </p>
    </div>
    <Card>
      <CardContent className="space-y-2 p-4">
        {(canAccess("Administración", "Usuarios") || isAdmin) && (
          <Row
            to="/settings?sub=usuarios"
            icon={Shield}
            title={t("settings.users")}
            description={t("settings.usersDesc")}
          />
        )}
        {(canAccess("Administración", "Auditoría") || isAdmin) && (
          <Row
            to="/settings?sub=auditoria"
            icon={ClipboardCheck}
            title={t("settings.audit")}
            description={t("settings.auditDesc")}
          />
        )}
        {isAdmin && (
          <Row
            to="/settings?sub=reportes"
            icon={Send}
            title={t("settings.reports")}
            description={t("settings.reportsDesc")}
          />
        )}
      </CardContent>
    </Card>
  </div>
  );
};

const ResourcesTab = ({ t }: { t: ReturnType<typeof useLanguage>["t"] }) => (
  <div className="space-y-4">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t("sidebar.resources") || "Recursos"}</h1>
      <p className="text-sm text-muted-foreground">
        {t("settings.resourcesDesc")}
      </p>
    </div>
    <Card>
      <CardContent className="space-y-2 p-4">
        <Row
          to="/settings?sub=design-system"
          icon={Palette}
          title={t("nav.designSystem") || "Design System"}
          description={t("settings.designSystemDesc")}
        />
        <Row
          to="/settings?sub=docs"
          icon={FileText}
          title={t("nav.docs") || "Docs"}
          description={t("settings.docsDesc")}
        />
        <Row
          to="/settings?sub=roadmap"
          icon={Map}
          title="Roadmap"
          description={t("settings.roadmapDesc")}
        />
      </CardContent>
    </Card>
  </div>
);

const Settings = () => {
  const { t } = useLanguage();
  const { canAccess } = usePermissions();
  const { isAdmin, role } = useUserRole();
  const { signOut } = useAuth();
  const { toast: notifyToast } = useToast();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    notifyToast({ title: t("topbar.logoutSuccess"), description: t("topbar.logoutDesc") });
    navigate("/login");
  };

  const showProyectoMP = canAccess("ProyectoMP") || isAdmin;
  const showAdmin = canAccess("Administración") || isAdmin;
  const showResources = showAdmin;

  // Build the tab list dynamically — same canAccess() rules the
  // sidebar used to apply.
  const tabs: TabDef[] = [
    { key: "account", label: t("settings.myAccount"), icon: UserIcon },
    ...(showProyectoMP ? [{ key: "mp" as const, label: t("settings.mpTitle"), icon: Rocket }] : []),
    ...(showAdmin ? [{ key: "admin" as const, label: t("settings.adminTitle"), icon: Shield }] : []),
    ...(showResources ? [{ key: "resources" as const, label: t("sidebar.resources") || "Recursos", icon: Palette }] : []),
  ];

  const [active, setActive] = useState<TabKey>("account");

  // Pretty role label — "Admin" / "Manager" / etc, falls back to the
  // raw role string when nothing matches.
  const roleLabel: Record<string, string> = {
    admin: "Admin",
    manager: "Manager",
    agent: "Chatter",
    employee: t("settings.roleEmployee"),
    closer: "Closer",
    supervisor: "Supervisor",
  };
  const prettyRole = role ? roleLabel[role] ?? role : "—";

  return (
    <main className="flex flex-1 overflow-y-auto">
      {/* Left rail — sits flush against the app sidebar (no outer max-w
          centring) so it reads as a proper desktop two-pane layout
          rather than a centred mobile card. */}
      <aside className="sub-rail w-64 shrink-0 border-r bg-card/40 p-4">
        <div className="sticky top-4">
          {/* Header del rail — mismo tratamiento tipográfico que los
              headers de sección del sidebar principal (text-[11px],
              tracking-widest, foreground/70). */}
          <div className="px-2 pb-3 text-[11px] font-semibold uppercase tracking-widest text-foreground/70">
            {t("settings.connectedAs", { role: prettyRole })}
          </div>
          {/* Tabs — mismo lenguaje que la sidebar principal:
              sidebar-glass-hover en reposo + sidebar-glass-active cuando
              el tab está seleccionado (accent bar + bg gradient + glow). */}
          <nav className="space-y-0.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = active === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActive(tab.key)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-sm sidebar-glass-hover ${
                    isActive ? "sidebar-glass-active font-medium" : ""
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Cerrar sesión — última opción del rail, separada con border-t
              para señalar que es una acción (no un tab). Hover destructivo
              porque la sesión ya no vive como botón en la sidebar global. */}
          <div className="mt-4 border-t border-border/60 pt-4">
            <button
              type="button"
              onClick={handleLogout}
              className="group flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-4 w-4 shrink-0 transition-colors group-hover:text-destructive" />
              <span className="truncate">{t("topbar.logout")}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Right side — active tab content, flush-left so it fills the
          available width on desktop instead of floating in the middle
          like a mobile screen. Si hay ?sub=<key>, embedimos la
          sub-página acá adentro (con header de "Volver al menú" arriba)
          en vez de mandar al usuario a otra ruta. */}
      <SettingsRightPane
        active={active}
        showProyectoMP={showProyectoMP}
        showAdmin={showAdmin}
        showResources={showResources}
        canAccess={canAccess}
        isAdmin={isAdmin}
        t={t}
      />
    </main>
  );
};

// Right pane que decide entre el tab content normal o una sub-página
// embebida según ?sub=. Vive como componente aparte para poder usar
// hooks (useSearchParams) sin contaminar el render principal.
const SettingsRightPane = ({
  active,
  showProyectoMP,
  showAdmin,
  showResources,
  canAccess,
  isAdmin,
  t,
}: {
  active: TabKey;
  showProyectoMP: boolean;
  showAdmin: boolean;
  showResources: boolean;
  canAccess: ReturnType<typeof usePermissions>["canAccess"];
  isAdmin: boolean;
  t: ReturnType<typeof useLanguage>["t"];
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const sub = searchParams.get("sub");

  // Cuando el user cambia de tab en el rail izquierdo, limpiamos el
  // ?sub= del URL. Sin esto, el sub-page del tab anterior (ej. Reportes
  // programados de Administración) quedaba pegado al cambiar a otro tab
  // (ej. Mi cuenta) — el sub-param es del scope de Administración pero
  // no se invalidaba al salir de ahí. Sólo limpiamos cuando hay un sub
  // activo para no escribir al URL en cada render.
  useEffect(() => {
    if (sub) {
      const next = new URLSearchParams(searchParams);
      next.delete("sub");
      setSearchParams(next, { replace: true });
    }
    // Dependencia sólo en `active`. Cuando el user clickea una sub-page
    // adentro del mismo tab, `active` no cambia, así que este effect no
    // dispara. Sólo dispara al cambiar de tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Cuáles sub-keys son embeddable. Cualquier otra cosa se ignora.
  const SUB_PAGES: Record<string, { title: string; render: () => JSX.Element }> = {
    usuarios:        { title: t("settings.users"),        render: () => <AdminUsuarios /> },
    auditoria:       { title: t("settings.audit"),        render: () => <AuditoriaRoles /> },
    reportes:        { title: t("settings.reportsShort"), render: () => <AdminReportes /> },
    "design-system": { title: "Design System",  render: () => <DesignSystem /> },
    docs:            { title: "Docs",           render: () => <Docs /> },
    roadmap:         { title: "Roadmap",        render: () => <Roadmap /> },
  };
  // ⚠️ GUARD (24/08): antes esto renderizaba la sub-página SOLO por el ?sub= de la
  // URL y retornaba ANTES del gate `showAdmin` de más abajo. Es decir: cualquier
  // usuario autenticado escribía /settings?sub=usuarios y obtenía la pantalla de
  // Usuarios completa (el link estaba escondido, la ruta de render no). Las páginas
  // de administración ahora exigen el mismo permiso que su entrada del menú.
  const SUB_PAGE_ALLOWED: Record<string, boolean> = {
    usuarios: showAdmin,
    auditoria: showAdmin,
    reportes: showAdmin,
    "design-system": true,
    docs: true,
    roadmap: true,
  };
  const activeSub = sub && SUB_PAGES[sub] && SUB_PAGE_ALLOWED[sub] ? SUB_PAGES[sub] : null;

  if (activeSub) {
    const goBack = () => {
      // Quita el query param sin perder otros (si los hubiera).
      const next = new URLSearchParams(searchParams);
      next.delete("sub");
      setSearchParams(next, { replace: true });
    };
    return (
      <section className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-background/60 px-6 py-3 backdrop-blur-xl">
          <Button variant="ghost" size="sm" onClick={goBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            {t("settings.backToMenu")}
          </Button>
          <span className="text-sm font-medium text-muted-foreground">·</span>
          <span className="text-sm font-medium">{activeSub.title}</span>
        </div>
        {activeSub.render()}
      </section>
    );
  }

  return (
    <section className="min-w-0 flex-1 overflow-y-auto p-6 lg:p-8">
      {active === "account" && <MyAccountTab />}
      {active === "mp" && showProyectoMP && <ProyectoMPTab />}
      {active === "admin" && showAdmin && <AdminTab canAccess={canAccess} isAdmin={isAdmin} />}
      {active === "resources" && showResources && <ResourcesTab t={t} />}
    </section>
  );
};

export default Settings;
