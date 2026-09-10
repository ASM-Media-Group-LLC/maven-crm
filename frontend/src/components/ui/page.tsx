import * as React from "react";
import { cn } from "@/lib/utils";

// Contenedor canónico de página: el scroll propio que exige el AppShell
// (`h-dvh` + `overflow-hidden`: cada página pone su propio scroll) y el padding
// responsive (16 px en teléfono, 24 en escritorio). SIN tope de ancho: Maven
// ocupa toda la pantalla y en un monitor grande el contenido se reparte en
// columnas y paneles, no se acota (decisión de Jhon, 09/09/2026: los topes de
// 720/1200/1700 dejaban las pantallas "perdidas en un vacío" a 2560 px).
interface PageProps {
  /**
   * `true` (default): la página scrollea acá. `false`: la pantalla maneja su alto
   * (conversación, sala, videollamada) y el contenedor solo pasa el alto disponible.
   */
  scroll?: boolean;
  /** Padding interno estándar. `false` si la pantalla lo pone. */
  padded?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 *   <Page>
 *     <PageHeader title="Closers" subtitle="Pipeline de agencias y creadoras." actions={...} />
 *     ...
 *   </Page>
 */
export function Page({ scroll = true, padded = true, className, children }: PageProps) {
  return (
    <main
      className={cn(
        "flex-1 min-h-0 min-w-0 flex flex-col",
        scroll ? "overflow-y-auto" : "overflow-hidden",
        className,
      )}
    >
      <div
        className={cn(
          "w-full",
          scroll ? "" : "flex-1 min-h-0 flex flex-col",
          padded && "px-4 py-4 sm:px-6 sm:py-6",
        )}
      >
        {children}
      </div>
    </main>
  );
}
