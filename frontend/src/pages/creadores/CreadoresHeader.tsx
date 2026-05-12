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
  <header className="bg-background/60 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
    <h1 className="text-2xl font-bold mb-4">Dashboard de Creadores</h1>
    <div className="flex items-center justify-between gap-3">
      <CreadoresSubtabs />
      {action}
    </div>
  </header>
);

export default CreadoresHeader;
