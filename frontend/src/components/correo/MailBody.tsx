import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageOff, MoreHorizontal } from "lucide-react";
import { partirCitado, partirCitadoTexto } from "@/lib/mailCita";
import { cn } from "@/lib/utils";

/**
 * Pinta el cuerpo de un correo.
 *
 * SEGUNDA CAPA DE DEFENSA. El backend ya saneó este HTML con lista blanca
 * (`_shared/html-sanitize.ts`), pero sanear HTML con manipulación de texto
 * es notoriamente difícil de hacer perfecto. Acá va la garantía real: el
 * contenido se pinta dentro de un iframe con `sandbox`, así que aunque algo
 * se hubiera escapado del saneador, no puede ejecutarse.
 *
 * POR QUÉ ESTOS PERMISOS Y NO OTROS:
 *
 * - **Sin `allow-scripts`** — es lo único que importa de verdad. Sin ese
 *   permiso NINGÚN script corre, venga de donde venga y haya sobrevivido a
 *   lo que haya sobrevivido. Es la línea que no se cruza: agregarlo
 *   convertiría al saneador en la única defensa.
 * - **Con `allow-same-origin`** — para poder medir la altura del contenido
 *   desde afuera y que el correo no quede en una cajita con scroll propio.
 *   Sin `allow-scripts` no habilita nada peligroso: el riesgo conocido de
 *   `allow-same-origin` es combinarlo con scripts (el iframe podría quitarse
 *   el propio sandbox), y sin ejecución de código eso no existe.
 * - **Con `allow-popups`** — para que los enlaces del correo abran. El
 *   saneador ya rechazó `javascript:` y `data:`, y les puso
 *   `rel="noopener noreferrer nofollow"`.
 *
 * Y una capa más por si acaso: un CSP dentro del propio documento, que
 * además es el mecanismo con el que se bloquean las imágenes remotas.
 */

interface Props {
  html: string | null;
  text: string | null;
  remoteImages: number;
  truncated: boolean;
}

/** CSP del documento del correo.
 *
 *  `default-src 'none'` corta todo por defecto: nada de scripts, iframes,
 *  fetch, websockets ni fuentes remotas. Se abre SOLO lo necesario para que
 *  un correo se vea bien.
 *
 *  Las imágenes remotas son el interruptor: bloquearlas no es capricho
 *  estético. Un `<img>` a un servidor ajeno le confirma al remitente que
 *  abriste el correo, a qué hora y desde qué IP — es exactamente lo que
 *  hace un píxel de rastreo. Se cargan solo si la persona lo pide. */
function csp(cargarRemotas: boolean): string {
  const img = cargarRemotas ? "data: https:" : "data:";
  return [
    "default-src 'none'",
    `img-src ${img}`,
    "style-src 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "font-src data:",
  ].join("; ");
}

function documento(cuerpo: string, cargarRemotas: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp(cargarRemotas)}">
<base target="_blank">
<style>
  /* LIENZO SIEMPRE CLARO, a propósito. Los correos HTML se escriben
     asumiendo fondo blanco: llegan con color:#222 inline y sin fondo.
     Con un iframe transparente sobre el tema oscuro de Maven, ese texto
     era casi invisible (negro sobre negro). Gmail resuelve esto igual:
     el mensaje se pinta como tarjeta clara, sin importar el tema. */
  :root { color-scheme: light; }
  body {
    margin: 0; padding: 16px 18px;
    font: 14px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #1c1c22; background: #ffffff;
    overflow-wrap: break-word; word-break: break-word;
  }
  /* Los correos vienen con tablas de ancho fijo pensadas para escritorio.
     Sin esto, en un teléfono se sale de la pantalla y rompe el layout. */
  img, table, td, pre { max-width: 100% !important; }
  img { height: auto; }
  table { border-collapse: collapse; }
  pre { white-space: pre-wrap; }
  a { color: #2563eb; }
  /* El envoltorio existe SOLO para medir: el alto de <body> nunca baja del
     alto del iframe (scrollHeight >= clientHeight), así que un correo de dos
     líneas quedaba en una tarjeta blanca de 240px casi vacía. Un div sí
     reporta su alto real. */
  #medida { display: block; }
</style></head><body><div id="medida">${cuerpo}</div></body></html>`;
}

/** Escapa texto plano para mostrarlo dentro del iframe. */
function textoPlano(t: string): string {
  const esc = t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<pre style="font:14px/1.6 system-ui,-apple-system,sans-serif;margin:0">${esc}</pre>`;
}

export function MailBody({ html, text, remoteImages, truncated }: Props) {
  const [cargarRemotas, setCargarRemotas] = useState(false);
  const [verCita, setVerCita] = useState(false);
  const [alto, setAlto] = useState(160);   // provisorio: se remide con el contenido
  const ref = useRef<HTMLIFrameElement>(null);

  // Lo CITADO se pliega, como el «•••» de Gmail. Con los hilos apilados
  // arriba, la cita es texto repetido — y en una cadena de cinco respuestas
  // cada mensaje arrastra a los cuatro anteriores, con sangría creciente.
  const partido = useMemo(
    () => (html ? partirCitado(html) : { propio: null as string | null, citado: null }),
    [html],
  );
  const partidoTexto = useMemo(
    () => (!html && text ? partirCitadoTexto(text) : { propio: text, citado: null }),
    [html, text],
  );
  const hayCita = !!(partido.citado ?? partidoTexto.citado);

  const srcDoc = useMemo(() => {
    const armarHtml = () =>
      verCita || !partido.citado
        ? (html as string)
        : (partido.propio ?? "");
    const armarTexto = () => {
      const t = verCita || !partidoTexto.citado ? text : partidoTexto.propio;
      return t ? textoPlano(t) : "<p><em>(sin contenido)</em></p>";
    };
    return documento(html ? armarHtml() : armarTexto(), cargarRemotas);
  }, [html, text, cargarRemotas, verCita, partido, partidoTexto]);

  // Medimos la altura del contenido para que el correo se lea de corrido, sin
  // un scroll dentro de otro scroll. Se vuelve a medir cuando cambia el
  // documento (por ejemplo al desbloquear las imágenes, que agregan alto).
  useEffect(() => {
    const marco = ref.current;
    if (!marco) return;

    const medir = () => {
      try {
        const doc = marco.contentDocument;
        if (!doc?.body) return;
        // El alto REAL es el del envoltorio (ver #medida en `documento()`);
        // body/documentElement nunca bajan del alto del propio iframe.
        const medida = doc.getElementById("medida");
        const h = medida
          ? Math.ceil(medida.getBoundingClientRect().height) + 32   // + el padding del body
          : Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
        // ⚠️ El piso estaba en 96 y una respuesta de una palabra quedaba en
        // una tarjeta blanca medio vacía. 44 es una línea con su padding: lo
        // justo para que un «Test» se vea como un «Test».
        if (h > 0) setAlto(Math.min(Math.max(h, 44), 20000));
      } catch {
        // Si el navegador no deja leer el documento, queda el alto por
        // defecto y el iframe scrollea solo. Se ve peor, no se rompe.
      }
    };

    medir();
    marco.addEventListener("load", medir);
    // Las imágenes cambian el alto DESPUÉS del load: sin observarlas, el
    // correo queda cortado justo cuando termina de cargar.
    let obs: ResizeObserver | null = null;
    try {
      const cuerpo = marco.contentDocument?.body;
      if (cuerpo && "ResizeObserver" in window) {
        obs = new ResizeObserver(medir);
        obs.observe(cuerpo);
      }
    } catch {
      /* sin observador: nos quedamos con la medición del load */
    }
    return () => {
      marco.removeEventListener("load", medir);
      obs?.disconnect();
    };
  }, [srcDoc]);

  return (
    <div className="space-y-3">
      {remoteImages > 0 && !cargarRemotas && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-primary/5 px-4 py-2.5 text-sm">
          <ImageOff className="h-4 w-4 shrink-0 text-primary/70" />
          <span className="text-muted-foreground">
            {remoteImages === 1
              ? "Se bloqueó 1 imagen externa."
              : `Se bloquearon ${remoteImages} imágenes externas.`}{" "}
            Cargarlas le avisa a quien lo envió que abriste el correo.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto rounded-full"
            onClick={() => setCargarRemotas(true)}
          >
            Mostrar imágenes
          </Button>
        </div>
      )}

      {truncated && (
        <p className="rounded-2xl bg-warning/10 px-4 py-2.5 text-sm text-muted-foreground">
          El correo es muy largo y se muestra recortado.
        </p>
      )}

      {/* La tarjeta blanca redondeada es deliberada: el documento de
          adentro tiene fondo blanco fijo (ver `documento()`), y el borde
          redondeado lo integra al tema oscuro en vez de verse pegado. */}
      <iframe
        ref={ref}
        title="Contenido del correo"
        srcDoc={srcDoc}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="w-full rounded-2xl border-0 bg-white"
        style={{ height: alto }}
      />

      {/* El «•••» de Gmail: lo citado plegado. Es un botón de verdad y no un
          adorno — se abre y se vuelve a cerrar, y mientras está cerrado el
          correo se lee sin la escalera de citas de las respuestas anteriores. */}
      {hayCita && (
        <button
          type="button"
          onClick={() => setVerCita((v) => !v)}
          aria-expanded={verCita}
          aria-label={verCita ? "Ocultar lo citado" : "Mostrar lo citado"}
          title={verCita ? "Ocultar lo citado" : "Mostrar lo citado"}
          className={cn(
            "flex h-5 items-center rounded-full bg-muted px-2 transition-colors",
            "hover:bg-muted-foreground/25",
          )}
        >
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
