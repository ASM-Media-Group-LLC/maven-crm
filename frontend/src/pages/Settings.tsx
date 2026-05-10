import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Rocket,
  Shield,
  ClipboardCheck,
  Palette,
  FileText,
  Map,
  ChevronRight,
  Camera,
  Loader2,
  KeyRound,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useLanguage } from "@/hooks/useLanguage";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile, useUploadUserAvatar } from "@/hooks/useUserProfile";
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
  const { user } = useAuth();
  const profileQ = useMyProfile();
  const upload = useUploadUserAvatar();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pwOpen, setPwOpen] = useState(false);

  const fullName = user?.user_metadata?.full_name || profileQ.data?.full_name || "Usuario";
  const email = user?.email || "";
  const initials = fullName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const avatarUrl = profileQ.data?.avatar_url ?? null;

  const handleFile = async (file: File) => {
    try {
      await upload.mutateAsync(file);
      toast.success("Foto de perfil actualizada");
    } catch (e) {
      toast.error("No se pudo subir", { description: (e as Error).message });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mi cuenta</h1>
        <p className="text-sm text-muted-foreground">
          Foto de perfil y seguridad de la cuenta.
        </p>
      </div>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-5">
            <div className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-full">
              <Avatar className="h-full w-full">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={fullName} />}
                <AvatarFallback className="text-xl">{initials}</AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={upload.isPending}
                className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 text-white opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-100"
                aria-label="Cambiar foto de perfil"
              >
                {upload.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-[10px]">Subiendo…</span>
                  </>
                ) : (
                  <>
                    <Camera className="h-5 w-5" />
                    <span className="text-[10px]">Cambiar</span>
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
                Pasa el cursor sobre la imagen para subir una nueva foto.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="mb-3 text-sm font-semibold">Seguridad</div>
          <Button variant="outline" onClick={() => setPwOpen(true)} className="gap-2">
            <KeyRound className="h-4 w-4" />
            Cambiar contraseña
          </Button>
        </CardContent>
      </Card>

      <ChangePasswordModal open={pwOpen} onOpenChange={setPwOpen} />
    </div>
  );
};

const ProyectoMPTab = () => (
  <div className="space-y-4">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Proyecto MP</h1>
      <p className="text-sm text-muted-foreground">
        Pipeline, tareas, contenido y métricas del proyecto MP.
      </p>
    </div>
    <Card>
      <CardContent className="space-y-2 p-4">
        <Row
          to="/proyectomp"
          icon={Rocket}
          title="Abrir Proyecto MP"
          description="Dashboard principal con todas las pestañas."
        />
      </CardContent>
    </Card>
  </div>
);

const AdminTab = ({ canAccess, isAdmin }: { canAccess: ReturnType<typeof usePermissions>["canAccess"]; isAdmin: boolean }) => (
  <div className="space-y-4">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Administración</h1>
      <p className="text-sm text-muted-foreground">
        Usuarios, roles y auditoría de la plataforma.
      </p>
    </div>
    <Card>
      <CardContent className="space-y-2 p-4">
        {(canAccess("Administración", "Usuarios") || isAdmin) && (
          <Row
            to="/admin/usuarios"
            icon={Shield}
            title="Usuarios"
            description="Gestión de usuarios, roles y permisos."
          />
        )}
        {(canAccess("Administración", "Roles") || isAdmin) && (
          <Row
            to="/admin/auditoria"
            icon={ClipboardCheck}
            title="Auditoría"
            description="Historial de cambios de roles y permisos."
          />
        )}
      </CardContent>
    </Card>
  </div>
);

const ResourcesTab = ({ t }: { t: ReturnType<typeof useLanguage>["t"] }) => (
  <div className="space-y-4">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t("sidebar.resources") || "Recursos"}</h1>
      <p className="text-sm text-muted-foreground">
        Documentación, design system y roadmap.
      </p>
    </div>
    <Card>
      <CardContent className="space-y-2 p-4">
        <Row
          to="/design-system"
          icon={Palette}
          title={t("nav.designSystem") || "Design System"}
          description="Componentes, paleta y guía de estilo."
        />
        <Row
          to="/docs"
          icon={FileText}
          title={t("nav.docs") || "Docs"}
          description="Documentación interna del proyecto."
        />
        <Row
          to="/roadmap"
          icon={Map}
          title="Roadmap"
          description="Seguimiento de funciones planificadas."
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
    { key: "account", label: "Mi cuenta", icon: UserIcon },
    ...(showProyectoMP ? [{ key: "mp" as const, label: "Proyecto MP", icon: Rocket }] : []),
    ...(showAdmin ? [{ key: "admin" as const, label: "Administración", icon: Shield }] : []),
    ...(showResources ? [{ key: "resources" as const, label: t("sidebar.resources") || "Recursos", icon: Palette }] : []),
  ];

  const [active, setActive] = useState<TabKey>("account");

  // Pretty role label — "Admin" / "Manager" / etc, falls back to the
  // raw role string when nothing matches.
  const roleLabel: Record<string, string> = {
    admin: "Admin",
    manager: "Manager",
    agent: "Chatter",
    employee: "Empleado",
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
            Conectado como {prettyRole}
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
              <span className="truncate">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Right side — active tab content, flush-left so it fills the
          available width on desktop instead of floating in the middle
          like a mobile screen. */}
      <section className="min-w-0 flex-1 overflow-y-auto p-6 lg:p-8">
        {active === "account" && <MyAccountTab />}
        {active === "mp" && showProyectoMP && <ProyectoMPTab />}
        {active === "admin" && showAdmin && <AdminTab canAccess={canAccess} isAdmin={isAdmin} />}
        {active === "resources" && showResources && <ResourcesTab t={t} />}
      </section>
    </main>
  );
};

export default Settings;
