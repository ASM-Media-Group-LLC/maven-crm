// "El sistema, cerrado": las ocho reglas del rediseño de septiembre de 2026.
// Es la referencia que el resto del Design System detalla. Los ejemplos usan
// las piezas reales (Page, PageHeader, StatChip, tokens) para que la página
// se rompa si el sistema cambia por debajo.
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PAGE_WIDTHS } from "@/lib/pageWidths";
import StatChip from "@/components/StatChip";

const Regla = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <div className="rounded-panel border border-border bg-card p-5 space-y-3">
    <h3 className="font-display text-lg font-semibold">{titulo}</h3>
    {children}
  </div>
);

const Texto = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
);

const Muestra = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-control border border-dashed border-border bg-background p-4 ${className}`}>{children}</div>
);

const Codigo = ({ children }: { children: ReactNode }) => (
  <code className="font-mono text-xs text-foreground bg-muted px-1 py-0.5 rounded-control">{children}</code>
);

const TELEFONO_PX = 390;
const MAX_PX = PAGE_WIDTHS.tablero.max;

export const SistemaSection = () => (
  <section id="sistema" className="space-y-8">
    <div>
      <h2 className="text-3xl font-semibold mb-2">1.0 El sistema, cerrado</h2>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Ocho reglas del rediseño de septiembre de 2026. Casi todas ya tienen su pieza en el código; lo nuevo es
        que son obligatorias para toda pantalla nueva (<Codigo>frontend/src/test/contratoDeDiseno.test.ts</Codigo>)
        y que las pantallas anteriores se migran por fases sin quitar ninguna función. Tesis: Maven se ve como una
        sala de control bien iluminada. Una idea por pantalla, gente con cara, el ancho es diseño, un acento manda,
        superficies y no cajas.
      </p>
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <Regla titulo="Tipografía">
        <Muestra className="space-y-1.5">
          <p className="font-display text-3xl font-bold tracking-tight">Sora en títulos</p>
          <p className="font-display text-2xl font-bold tabular-nums">1.284 en cifras</p>
          <p className="text-base">Cuerpo con la sans del sistema.</p>
          <p className="text-xs text-muted-foreground">Etiqueta en oración</p>
          <p className="font-mono text-xs text-muted-foreground tabular-nums">T2GEGG&nbsp;&nbsp;09:03</p>
        </Muestra>
        <Texto>
          Dos familias: Sora (<Codigo>font-display</Codigo>) en títulos y cifras, la sans del sistema en el cuerpo.
          Escala única: <Codigo>text-3xl / 2xl / xl / base / sm / xs</Codigo>. Las etiquetas van en oración
          (<Codigo>text-xs text-muted-foreground</Codigo>): se retira la ceja en mayúsculas espaciadas.
          <Codigo>font-mono</Codigo> solo para lo que es código: claves de sala, IDs, horas en columna.
        </Texto>
      </Regla>

      <Regla titulo="Color">
        <Muestra>
          <div className="flex gap-1.5">
            <span className="h-8 flex-1 rounded-control bg-gradient-to-r from-accent to-primary" title="acento de marca" />
            <span className="h-8 flex-1 rounded-control bg-success" title="success" />
            <span className="h-8 flex-1 rounded-control bg-warning" title="warning" />
            <span className="h-8 flex-1 rounded-control bg-destructive" title="destructive" />
            <span className="h-8 flex-1 rounded-control bg-whatsapp" title="whatsapp" />
            <span className="h-8 flex-1 rounded-control bg-telegram" title="telegram" />
          </div>
          <div className="mt-2 flex gap-1.5 text-[11px] text-muted-foreground">
            <span className="flex-1">acento</span><span className="flex-1">success</span><span className="flex-1">warning</span>
            <span className="flex-1">destructive</span><span className="flex-1">whatsapp</span><span className="flex-1">telegram</span>
          </div>
        </Muestra>
        <Texto>
          Seis roles. El acento de marca (<Codigo>primary</Codigo>, <Codigo>accent</Codigo> y su degradé) para acción y
          foco. <Codigo>success</Codigo> / <Codigo>warning</Codigo> / <Codigo>destructive</Codigo> solo significan estado.
          <Codigo>whatsapp</Codigo> y <Codigo>telegram</Codigo> solo marcan canal. Nada más tiene color propio: las
          paletas decorativas (avatares, categorías) viven en <Codigo>lib/</Codigo>, no en la pantalla. El degradé va en lo
          que actúa (botón primario, burbuja propia, pestaña activa); el fondo se queda quieto. Los skins repintan el
          acento y se quedan como están.
        </Texto>
      </Regla>

      <Regla titulo="Anchos y teléfono">
        <Muestra className="space-y-2">
          {(Object.keys(PAGE_WIDTHS) as Array<keyof typeof PAGE_WIDTHS>).map((k) => (
            <div key={k} className="flex items-center gap-3 text-xs">
              <span className="w-16 shrink-0 capitalize text-muted-foreground">{k}</span>
              <div className="h-2.5 rounded-full bg-primary/70" style={{ width: `${(PAGE_WIDTHS[k].max / MAX_PX) * 100}%` }} />
              <span className="tabular-nums text-muted-foreground">{PAGE_WIDTHS[k].max} px</span>
            </div>
          ))}
          <div className="flex items-center gap-3 text-xs">
            <span className="w-16 shrink-0 text-muted-foreground">Teléfono</span>
            <div className="h-2.5 rounded-full bg-gradient-to-r from-accent to-primary" style={{ width: `${(TELEFONO_PX / MAX_PX) * 100}%` }} />
            <span className="tabular-nums text-muted-foreground">{TELEFONO_PX} px, una columna</span>
          </div>
        </Muestra>
        <Texto>
          Cada pantalla declara su ancho con <Codigo>{'<Page width="lectura | trabajo | tablero">'}</Codigo>; el
          contenedor centra, acota y pone el padding (16 px en teléfono, 24 en escritorio) y el scroll propio que pide
          el AppShell. Lectura: {PAGE_WIDTHS.lectura.uso}. Trabajo: {PAGE_WIDTHS.trabajo.uso}. Tablero: {PAGE_WIDTHS.tablero.uso}.
          En el teléfono todo es una columna: sin desborde horizontal, ninguna tabla sin versión en tarjetas, controles de 44 px.
        </Texto>
      </Regla>

      <Regla titulo="Superficies y radios">
        <Muestra>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
            <div className="h-14 rounded-panel border border-dashed border-border flex items-end justify-center pb-1">fondo</div>
            <div className="h-14 rounded-panel border border-border bg-card flex items-end justify-center pb-1">panel</div>
            <div className="h-14 rounded-panel border border-border bg-card shadow-lg flex items-end justify-center pb-1">realce</div>
          </div>
          <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="h-7 w-7 rounded-control bg-primary/70" /> control 8
            <span className="h-7 w-7 rounded-panel bg-primary/70" /> panel 12
            <span className="h-7 w-7 rounded-card bg-primary/70" /> card 16
            <span className="h-7 w-7 rounded-full bg-primary/70" /> full
          </div>
        </Muestra>
        <Texto>
          Tres niveles: fondo plano, panel (borde hairline) para agrupar, realce (borde más claro y sombra) para UNA cosa
          por pantalla. Dentro de un panel las filas se separan con hairline, nunca con otra tarjeta; vidrio solo en lo que
          flota. Tres radios por rol: <Codigo>rounded-control</Codigo> (8) en controles, <Codigo>rounded-panel</Codigo> (12)
          en paneles, <Codigo>rounded-card</Codigo> (16) en tarjetas grandes y modales; <Codigo>rounded-full</Codigo> en
          chips y avatares. Espaciado en pasos de 4: 12 / 16 / 24 dentro de un panel, 24 / 32 entre bloques.
        </Texto>
      </Regla>

      <Regla titulo="Encabezado y navegación">
        <Muestra>
          <PageHeader
            title="Closers"
            subtitle="Pipeline de agencias y creadoras. 312 leads activos."
            actions={
              <>
                <Button size="sm" variant="outline">Exportar</Button>
                <Button size="sm">Nuevo lead</Button>
              </>
            }
          />
        </Muestra>
        <Texto>
          <Codigo>{"<PageHeader>"}</Codigo> en toda pantalla: título Sora 24, subtítulo en una frase (no una tira de
          metadatos con puntos medios), acciones a la derecha que bajan de fila si no caben. En el teléfono, más de dos
          acciones se pliegan en un menú de tres puntos. Menú: favoritos fijados arriba, grupos plegados, el resto en ⌘K;
          en el teléfono esos favoritos son la barra inferior (fase 3).
        </Texto>
      </Regla>

      <Regla titulo="Datos">
        <Muestra>
          <div className="grid grid-cols-2 gap-2">
            <StatChip label="Ventas hoy" value="$4.280" hint="▲ 12% vs ayer" color="bg-success" />
            <StatChip label="Cámara encendida" value="12 / 14" hint="2 apagadas" color="bg-warning" />
          </div>
        </Muestra>
        <Texto>
          Cifras con <Codigo>StatChip</Codigo>: etiqueta, número en Sora tabular, delta con signo y color semántico
          (la etiqueta pasa a oración en la fase 2). La franja de cifras acompaña; el protagonista de un tablero es lo que
          pasa (el feed, la sala, la lista), no la tarjeta de KPI. Gráficos con el tema único validado para daltonismo y
          punto final enfatizado. Tablas con encabezado pegajoso y filas de 44 px; en el teléfono la misma fila se vuelve
          tarjeta con cara, nombre, estado y una acción.
        </Texto>
      </Regla>

      <Regla titulo="Personas">
        <Muestra>
          <div className="flex flex-wrap gap-5 text-[11px] text-muted-foreground">
            {[
              ["ring-success", "en línea"],
              ["ring-primary", "en llamada"],
              ["ring-muted-foreground", "ausente"],
              ["ring-warning", "mejor del mes"],
            ].map(([anillo, estado]) => (
              <div key={estado} className="flex items-center gap-2">
                <span className={`h-8 w-8 rounded-full bg-gradient-to-br from-accent/60 to-primary/60 ring-2 ring-offset-2 ring-offset-background ${anillo}`} />
                {estado}
              </div>
            ))}
          </div>
        </Muestra>
        <Texto>
          <Codigo>UserAvatar</Codigo> en el 100% de las caras del equipo (tamaño por <Codigo>size</Codigo>, nunca por
          className). El anillo es estado: verde en línea, azul en llamada, gris ausente, dorado mejor del mes. En listas la
          cara va antes que el nombre; en tarjetas, arriba a la izquierda. La creadora lleva su foto de Instagram o sus
          iniciales, nunca muñequito: el muñequito es del equipo y de los estados vacíos.
        </Texto>
      </Regla>

      <Regla titulo="Movimiento y voz">
        <Muestra className="flex flex-wrap items-center gap-3">
          <Button size="sm" className="transition-colors duration-150">Guardar cambios</Button>
          <Button size="sm" variant="outline" className="transition-colors duration-150">Abrir sala</Button>
          <span className="text-xs text-muted-foreground">150 a 200 ms, solo en respuesta a una acción.</span>
        </Muestra>
        <Texto>
          El movimiento responde a una acción: abrir, expandir, confirmar. Una tarjeta quieta no se agranda al pasar el
          mouse (<Codigo>hover:scale</Codigo> se retira). Una celebración, el confeti, solo en cierres y récords. Nada anima al
          hacer scroll. Copy en español neutro, activo y corto: el botón dice lo que pasa y el aviso repite la misma palabra;
          un estado vacío invita a hacer algo.
        </Texto>
      </Regla>
    </div>

    <div className="rounded-panel border border-border bg-card p-5 space-y-3">
      <h3 className="font-display text-lg font-semibold">Cómo se cumple en una pantalla nueva</h3>
      <pre className="overflow-x-auto rounded-control bg-muted p-4 text-xs leading-relaxed"><code>{`import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";

export default function ClosersPage() {
  return (
    <Page width="trabajo">
      <PageHeader title="Closers" subtitle="Pipeline de agencias y creadoras." actions={<Button>Nuevo lead</Button>} />
      {/* cifras arriba, filtros en chips, tabla con su versión en tarjetas para el teléfono */}
    </Page>
  );
}`}</code></pre>
      <Texto>
        El test de contrato revisa toda ruta nueva de <Codigo>App.tsx</Codigo>: PageHeader, ancho declarado, tabla con
        versión móvil, cuadrículas con breakpoint, radios y colores del sistema, etiquetas en oración y sin hover que
        agranda. Las pantallas anteriores al contrato están listadas en el test y salen de la lista a medida que se migran.
      </Texto>
    </div>
  </section>
);
