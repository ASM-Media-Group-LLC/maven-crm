import * as React from "react";
import { cn } from "@/lib/utils";

// Contenedor canónico de página. Los tres anchos viven en lib/pageWidths.ts (así
// este archivo solo exporta el componente y el fast refresh no se queja).
import { PAGE_WIDTHS, type PageWidth } from "@/lib/pageWidths";

interface PageProps {
  /** Uno de los tres anchos. Obligatorio a propósito: es la decisión que cada pantalla declara. */
  width: PageWidth;
  /**
   * `true` (default): la página scrollea acá, cumpliendo el contrato de AppShell
   * (`h-dvh` + `overflow-hidden`: cada página pone su propio scroll).
   * `false`: la pantalla maneja su alto (conversación, sala, videollamada) y el
   * contenedor solo acota el ancho y pasa el alto disponible.
   */
  scroll?: boolean;
  /** Padding interno estándar (16 px en teléfono, 24 px en escritorio). `false` si la pantalla lo pone. */
  padded?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Contenedor canónico de página de Maven: scroll propio + ancho declarado + padding
 * responsive. Se usa alrededor de `<PageHeader>` y el contenido:
 *
 *   <Page width="trabajo">
 *     <PageHeader title="Closers" subtitle="Pipeline de agencias y creadoras." actions={...} />
 *     ...
 *   </Page>
 */
export function Page({ width, scroll = true, padded = true, className, children }: PageProps) {
  const ancho = PAGE_WIDTHS[width].className;
  return (
    <main
      data-page-width={width}
      className={cn(
        "flex-1 min-h-0 min-w-0 flex flex-col",
        scroll ? "overflow-y-auto" : "overflow-hidden",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto w-full",
          ancho,
          scroll ? "" : "flex-1 min-h-0 flex flex-col",
          padded && "px-4 py-4 sm:px-6 sm:py-6",
        )}
      >
        {children}
      </div>
    </main>
  );
}
