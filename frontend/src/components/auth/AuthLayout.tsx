import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { MarcaMaven } from "@/components/MarcaM";
import { useLanguage } from "@/hooks/useLanguage";
import "./entrar.css";

interface AuthLayoutProps {
  children: ReactNode;
}

/** El marco de las pantallas de entrar (login, olvidé/restablecer contraseña,
 *  entrada del portal), con la MISMA piel de la portada «La oficina,
 *  reinventada.» (Alvaro, 16/11/2026: «más al estilo del homepage»): azul
 *  marino, barra arriba con el logo, tarjeta como las de precios y el verde
 *  de los botones. Solo cambia cómo se ve: los formularios y la lógica de
 *  cada pantalla quedan como estaban. Las reglas viven en `entrar.css`,
 *  encerradas bajo `.entrar`. */
const AuthLayout = ({ children }: AuthLayoutProps) => {
  const { t } = useLanguage();
  return (
    <div className="entrar">
      <header className="entrar-barra">
        <Link to="/" className="entrar-marca" aria-label="Maven">
          <MarcaMaven />
        </Link>
        <Link to="/" className="entrar-volver">
          <ArrowLeft aria-hidden="true" />
          <span>{t("shared.authLayout.backHome")}</span>
        </Link>
      </header>
      <main className="entrar-centro">
        <div className="entrar-caja">{children}</div>
      </main>
    </div>
  );
};

export default AuthLayout;
