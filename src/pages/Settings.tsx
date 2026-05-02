import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { useLanguage } from "@/hooks/useLanguage";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile, useUploadUserAvatar } from "@/hooks/useUserProfile";
import ChangePasswordModal from "@/components/dashboard/ChangePasswordModal";

// Settings landing — tabs for Mi cuenta / Proyecto MP / Administración /
// Recursos. Mi cuenta is what the user lands on. The other three replace
// the corresponding sidebar groups so the left rail stays focused on the
// day-to-day operational tabs.

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
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Foto de perfil</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-5">
            {/* Hover-to-upload avatar (same pattern as the chatter
                profile editor — camera overlay, click-to-pick file). */}
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
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Seguridad</CardTitle>
        </CardHeader>
        <CardContent>
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

const Settings = () => {
  const { t } = useLanguage();
  const { canAccess } = usePermissions();
  const { isAdmin } = useUserRole();

  const showProyectoMP = canAccess("ProyectoMP") || isAdmin;
  const showAdmin = canAccess("Administración") || isAdmin;
  const showResources = showAdmin;

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Tu cuenta, administración y recursos de la plataforma.
          </p>
        </div>

        <Tabs defaultValue="account" className="w-full">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="account" className="gap-1.5">
              <UserIcon className="h-3.5 w-3.5" />
              Mi cuenta
            </TabsTrigger>
            {showProyectoMP && (
              <TabsTrigger value="mp" className="gap-1.5">
                <Rocket className="h-3.5 w-3.5" />
                Proyecto MP
              </TabsTrigger>
            )}
            {showAdmin && (
              <TabsTrigger value="admin" className="gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                Administración
              </TabsTrigger>
            )}
            {showResources && (
              <TabsTrigger value="resources" className="gap-1.5">
                <Palette className="h-3.5 w-3.5" />
                Recursos
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="account" className="mt-4">
            <MyAccountTab />
          </TabsContent>

          {showProyectoMP && (
            <TabsContent value="mp" className="mt-4">
              <Card>
                <CardContent className="space-y-2 pt-6">
                  <Row
                    to="/proyectomp"
                    icon={Rocket}
                    title="Proyecto MP"
                    description="Pipeline, tareas, contenido y métricas del proyecto MP."
                  />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {showAdmin && (
            <TabsContent value="admin" className="mt-4">
              <Card>
                <CardContent className="space-y-2 pt-6">
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
            </TabsContent>
          )}

          {showResources && (
            <TabsContent value="resources" className="mt-4">
              <Card>
                <CardContent className="space-y-2 pt-6">
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
            </TabsContent>
          )}
        </Tabs>
      </div>
    </main>
  );
};

export default Settings;
