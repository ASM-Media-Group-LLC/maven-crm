import { ReactNode } from "react";
import CreadoresSubtabs from "./CreadoresSubtabs";

// Header compartido por las 5 páginas de /creadores/* — título fijo y
// subtabs en posición constante entre rutas. Cada página puede pasar un
// `action` opcional (botón de "Agregar Creador", "Iniciar Onboarding",
// etc.) que se alinea a la derecha de los subtabs.
interface Props {
  action?: ReactNode;
}

const CreadoresHeader = ({ action }: Props) => (
  <header className="bg-background/30 backdrop-blur-xl px-4 pt-6 pb-4 border-b border-white/10 shrink-0 sm:px-6">
    <h1 className="text-2xl font-bold mb-4">Dashboard de Creadores</h1>
    {/* En el teléfono los subtabs ocupan el ancho (con scroll fino) y la acción
        baja a otra fila: antes la fila no envolvía y el botón quedaba fuera de
        la pantalla (Jhon, iPhone, 07/09/2026). */}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <CreadoresSubtabs />
      {action && <div className="flex w-full justify-end sm:w-auto">{action}</div>}
    </div>
  </header>
);

export default CreadoresHeader;
