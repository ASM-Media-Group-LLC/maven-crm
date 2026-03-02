import { Link } from "react-router-dom";
import Logo from "@/components/Logo";

const LandingFooter = () => (
  <footer className="bg-[hsl(240,10%,2%)] py-14">
    <div className="mx-auto max-w-6xl px-4">
      <div className="mb-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {/* Brand */}
        <div>
          <Logo size="sm" className="mb-3" />
          <p className="text-sm leading-relaxed text-white/50">
            La plataforma integral para gestionar, escalar y optimizar las operaciones de tu agencia de creadores.
          </p>
        </div>
        {/* Producto */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-white">Producto</h4>
          <ul className="space-y-2">
            {["Funcionalidades", "Módulos", "Beneficios", "Métricas"].map((label) => (
              <li key={label}>
                <a href={`#${label.toLowerCase()}`} className="text-sm text-white/50 transition-colors hover:text-white">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        {/* Módulos */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-white">Módulos</h4>
          <ul className="space-y-2">
            {["Creadores", "Sales & Revenue", "HR & RRHH", "Finanzas", "Messenger", "Tareas"].map((label) => (
              <li key={label}>
                <a href="#modulos" className="text-sm text-white/50 transition-colors hover:text-white">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        {/* Cuenta */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-white">Cuenta</h4>
          <ul className="space-y-2">
            <li>
              <Link to="/login" className="text-sm text-white/50 transition-colors hover:text-white">
                Iniciar sesión
              </Link>
            </li>
            <li>
              <Link to="/register" className="text-sm text-white/50 transition-colors hover:text-white">
                Crear cuenta
              </Link>
            </li>
            <li>
              <Link to="/forgot-password" className="text-sm text-white/50 transition-colors hover:text-white">
                Recuperar contraseña
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <p className="mt-6 text-center text-xs text-white/30">
        © {new Date().getFullYear()} Maven CRM. Todos los derechos reservados.
      </p>
    </div>
  </footer>
);

export default LandingFooter;
