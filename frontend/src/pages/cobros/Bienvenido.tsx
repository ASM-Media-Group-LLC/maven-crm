import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";

// La vuelta de Stripe después de poner la tarjeta (registro solo, vagón 7). El estado del
// cobro lo pone el webhook (checkout.session.completed); aquí solo se da la bienvenida y
// se lleva a entrar. Este navegador ya quedó apuntando al edificio (Empezar.tsx).
export default function Bienvenido() {
  const { t } = useLanguage();
  return (
    <AuthLayout>
      <div className="space-y-6 text-center">
        <CheckCircle2 aria-hidden="true" className="mx-auto h-10 w-10 text-white/80" />
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-white">{t("cobros.bienvenido.titulo")}</h2>
          <p className="text-sm text-white/60">{t("cobros.bienvenido.sub")}</p>
        </div>
        <Button asChild className="w-full">
          <Link to="/login">{t("cobros.bienvenido.entrar")}</Link>
        </Button>
      </div>
    </AuthLayout>
  );
}
