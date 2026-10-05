import { Link, Navigate, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { esCuentaDeCreadora } from "@/lib/portal/cuenta";
import FormContrasena from "./FormContrasena";

// Elegir contraseña después del enlace del correo (la invitación o «olvidé mi
// contraseña»). El enlace pasa por /reset-password, que abre la sesión y, si la
// cuenta es de creadora, la trae aquí. Con la contraseña puesta, entra directo
// a su espacio: no se le pide que vuelva a escribirla.

export default function PortalContrasena() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }
  if (user && !esCuentaDeCreadora(user)) return <Navigate to="/reset-password" replace />;

  return (
    <AuthLayout>
      {user ? (
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold text-white">{t("portal.contrasena.titulo")}</h1>
            <p className="text-sm text-white/60">{t("portal.contrasena.texto")}</p>
            <p className="text-sm font-medium text-white/80">{user.email}</p>
          </div>
          <FormContrasena
            oscuro
            onListo={() => {
              toast({ title: t("portal.contrasena.lista") });
              navigate("/portal", { replace: true });
            }}
          />
        </div>
      ) : (
        <div className="space-y-4 text-center">
          <h1 className="text-2xl font-bold text-white">{t("portal.contrasena.vencio")}</h1>
          <p className="text-sm text-white/60">{t("portal.contrasena.vencioTexto")}</p>
          <Button asChild className="min-h-11 w-full">
            <Link to="/forgot-password?desde=portal">{t("portal.contrasena.pedirOtro")}</Link>
          </Button>
        </div>
      )}
    </AuthLayout>
  );
}
