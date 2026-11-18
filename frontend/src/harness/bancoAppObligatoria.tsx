// Banco de pruebas: Cowork solo con la app de computador (17/11/2026).
// /harness.html?ver=app-obligatoria[&tema=claro] → arriba la franja de aviso, abajo la pantalla de bloqueo.
import { AvisoAppObligatoria, CoworkSoloEnLaApp } from "@/pages/cowork/CoworkSoloEnLaApp";

export default function BancoAppObligatoria() {
  return (
    <div className="fondo-glass flex h-dvh w-full overflow-hidden p-2 text-foreground">
      <main className="vidrio-panel relative flex flex-1 flex-col min-h-0 overflow-hidden">
        <AvisoAppObligatoria desde="2026-11-20T05:00:00Z" />
        <CoworkSoloEnLaApp />
      </main>
    </div>
  );
}
