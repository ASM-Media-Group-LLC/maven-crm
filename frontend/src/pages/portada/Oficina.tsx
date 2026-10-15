import { useEffect, useState } from "react";
import { Headphones, MousePointer2, Users } from "lucide-react";
import { Cara, nombreDe, type Seed } from "./gente";
import type { Publico } from "./guiones";

// EL HERO ES EL TABLERO DE COWORK, EN CHICO Y MANEJÁNDOSE SOLO.
//
// Un supervisor ve todas las salas a la vez: unas en cámara, otras compartiendo
// pantalla. A la izquierda, su rail —las pantallas en vivo y quién pide entrar—.
// A la derecha, las salas con sus controles (Escuchar / Hablar / Entrar) y un
// cursor que los va tocando solo para mostrar cómo se usa. Es el mismo tablero
// que vive más abajo en la página (Cowork.tsx), reconstruido en chico.
//
// Todo ILUSTRATIVO: personas inventadas (gente.tsx), nombres de sala genéricos,
// códigos de adorno, ni un cliente ni una cifra real.

type Estado = "habla" | "trabaja";
type Persona = { seed: Seed; estado: Estado };
type Sala = {
  n: string;
  codigo: string;
  gente: Persona[];     // quiénes están en la sala (cámara)
  titulo: string;       // qué muestra quien comparte pantalla
};

// Cuatro salas en una grilla 2×2. Como en Cowork de verdad, cada sala va
// alternando sola entre la cámara de la gente y la pantalla que alguien comparte.
const SALAS: Record<Publico, Sala[]> = {
  empresas: [
    { n: "Ventas", codigo: "T2GEGG", titulo: "Panel de ventas", gente: [{ seed: "camilo", estado: "habla" }, { seed: "valentina", estado: "trabaja" }] },
    { n: "Soporte", codigo: "H6WYPU", titulo: "Panel de soporte", gente: [{ seed: "luciana", estado: "trabaja" }] },
    { n: "Diseño", codigo: "K4MP2A", titulo: "Diseño · campaña", gente: [{ seed: "martina", estado: "trabaja" }] },
    { n: "Reunión", codigo: "BR8VZE", titulo: "Cartera del día", gente: [{ seed: "joaquin", estado: "habla" }, { seed: "sofia", estado: "habla" }] },
  ],
  agencias: [
    { n: "Chat 1", codigo: "T2GEGG", titulo: "Tablero del día", gente: [{ seed: "camilo", estado: "habla" }, { seed: "valentina", estado: "trabaja" }] },
    { n: "Soporte", codigo: "H6WYPU", titulo: "Reporte del día", gente: [{ seed: "luciana", estado: "trabaja" }] },
    { n: "Promoción", codigo: "K4MP2A", titulo: "Parrilla", gente: [{ seed: "martina", estado: "trabaja" }] },
    { n: "Cartera", codigo: "BR8VZE", titulo: "Cuentas", gente: [{ seed: "joaquin", estado: "habla" }, { seed: "sofia", estado: "habla" }] },
  ],
};

// Qué sala muestra pantalla ahora: Soporte queda fija compartiendo (siempre hay
// una pantalla a la vista) y las otras van alternando cámara ↔ pantalla, lento y
// desfasado, para que respire sin competir con el cursor.
const HERO_ANCLAS = new Set([1]);
const enPantalla = (i: number, ciclo: number): boolean =>
  HERO_ANCLAS.has(i) || (ciclo + i) % 4 === 0;

type Accion = "Escuchar" | "Hablar" | "Entrar";
const ACCIONES: Accion[] = ["Escuchar", "Hablar", "Entrar"];

// El recorrido del cursor: a qué sala va y qué botón toca. Se repite en bucle;
// las salas van por índice para que sirva igual en los dos públicos.
const PASOS: { sala: number; accion: Accion }[] = [
  { sala: 0, accion: "Escuchar" },
  { sala: 1, accion: "Entrar" },
  { sala: 3, accion: "Hablar" },
  { sala: 2, accion: "Escuchar" },
];

/** La pantalla compartida: un panel en vivo con la cámara chica de quien presenta. */
function Pantalla({ seed }: { seed: Seed }) {
  return (
    <div className="ofi-share cwx-fade">
      <div className="cwx-screen" aria-hidden="true">
        <div className="ss-bar"><i /><i /><i /></div>
        <div className="ss-body">
          <span className="l t" /><span className="l" /><span className="l" />
          <div className="ss-chart"><i /><i /><i /><i /><i /></div>
        </div>
      </div>
      <span className="ofi-share-quien">
        <span className="ofi-share-live" aria-hidden="true" />
        <Cara seed={seed} className="ofi-share-cara" />
        {nombreDe(seed)}
      </span>
    </div>
  );
}

function SalaVista({ s, resaltada, accion, paso, pantalla }: {
  s: Sala; resaltada: boolean; accion?: Accion; paso: number; pantalla: boolean;
}) {
  const presenta = s.gente[0].seed;
  return (
    <div className={`ofi-sala${resaltada ? " activa" : ""}`}>
      <div className="ofi-cab">
        <b>{s.n}</b>
        <span><Users width={10} height={10} strokeWidth={2.4} aria-hidden="true" />{s.gente.length}</span>
      </div>
      {/* La vista cambia sola entre pantalla y cámara; el `key` reinicia el fundido. */}
      <div className="ofi-escena">
        {pantalla ? (
          <Pantalla seed={presenta} key="scr" />
        ) : (
          // Cámara a pantalla completa: la cara llena el tile (como un video), con
          // la cámara chica del segundo y las ondas de voz — no caritas sueltas.
          <div className="ofi-cam cwx-fade" key="cam">
            <Cara seed={presenta} className="ofi-cam-full" />
            {s.gente[1] && <Cara seed={s.gente[1].seed} className="ofi-cam-pip" />}
            <span className="ofi-cam-voz" aria-hidden="true"><i /><i /><i /></span>
            <span className="ofi-share-quien">
              <span className="ofi-share-live" aria-hidden="true" />
              {nombreDe(presenta)}{s.gente.length > 1 ? ` +${s.gente.length - 1}` : ""}
            </span>
          </div>
        )}
      </div>
      <div className="ofi-acciones">
        {ACCIONES.map((a) => {
          const activo = resaltada && accion === a;
          return (
            <span className={`ofi-btn ofi-btn-${a.toLowerCase()}${activo ? " activo" : ""}`} key={a}>
              {a}
              {activo && (
                // El cursor vive SOBRE el botón activo: siempre alineado, sin
                // cálculo de coordenadas. El `key` por paso reanima el clic.
                <span className="ofi-cursor" aria-hidden="true">
                  <span className="ofi-click" key={paso} />
                  <MousePointer2 width={14} height={14} strokeWidth={2.2} fill="currentColor" />
                </span>
              )}
            </span>
          );
        })}
      </div>
      <div className="ofi-codigo">
        {pantalla ? `Compartiendo · ${nombreDe(presenta)}` : `código ${s.codigo}`}
      </div>
    </div>
  );
}

export default function Oficina({ publico }: { publico: Publico }) {
  const [hora, setHora] = useState("--:--:--");
  const [paso, setPaso] = useState(0);
  const [ciclo, setCiclo] = useState(0);

  useEffect(() => {
    const tic = () => {
      const d = new Date();
      setHora([d.getHours(), d.getMinutes(), d.getSeconds()]
        .map((n) => String(n).padStart(2, "0")).join(":"));
    };
    tic();
    const t = window.setInterval(tic, 1000);
    return () => window.clearInterval(t);
  }, []);

  // El recorrido: cada paso lleva el cursor a otra sala y "toca" un botón.
  useEffect(() => {
    const t = window.setInterval(() => setPaso((p) => (p + 1) % PASOS.length), 2400);
    return () => window.clearInterval(t);
  }, []);

  // El latido de cámara ↔ pantalla de las salas (lento, para que respire).
  useEffect(() => {
    const t = window.setInterval(() => setCiclo((c) => c + 1), 4200);
    return () => window.clearInterval(t);
  }, []);

  const salas = SALAS[publico];
  const { sala: salaResaltada, accion } = PASOS[paso];
  const escuchada = (salas[salaResaltada] ?? salas[0]).n;
  const hablantes = salas.flatMap((s) => s.gente.filter((p) => p.estado === "habla").map((p) => p.seed));
  const enSalas = salas.reduce((a, s) => a + s.gente.length, 0);
  const pantallasEnVivo = salas.filter((_, i) => enPantalla(i, ciclo));

  const pie = accion === "Hablar"
    ? <>Tú · hablando a <b>{escuchada}</b></>
    : accion === "Entrar"
      ? <>Tú · entrando a <b>{escuchada}</b></>
      : <>Tú · escuchando <b>{escuchada}</b> sin entrar</>;

  return (
    <div className="consola">
      <div className="consola-barra">
        <span className="semaforo"><i /><i /><i /></span>
        <span className="consola-titulo">cowork</span>
        <span className="ofi-live"><i />en vivo</span>
        <span className="ofi-cuenta">{enSalas} en salas · {hablantes.length} hablando</span>
        <span className="consola-reloj">{hora}</span>
      </div>

      {/* El tablero del supervisor: su rail + las salas. `.ofi` fija la altura
          (372px) para que el hero no salte al alternar con "un día". */}
      <div className="ofi">
      <div className="ofi-board" aria-label="Tablero de Cowork en vivo" key={publico}>
        <aside className="ofi-rail">
          <div className="ofi-rail-cab">
            <b>Tablero</b>
            <small>del supervisor</small>
          </div>
          <div className="ofi-rail-sec">
            <span className="ofi-rail-rot">Pantallas en vivo</span>
            {pantallasEnVivo.map((s) => (
              <div className="ofi-rail-item" key={s.n}>
                <Cara seed={s.gente[0].seed} className="ofi-rail-cara" />
                <span className="ofi-rail-nom">{nombreDe(s.gente[0].seed)}</span>
                <span className="ofi-rail-chip">{s.n}</span>
              </div>
            ))}
          </div>
          <div className="ofi-rail-sec">
            <span className="ofi-rail-rot amb">Solicitudes · 1</span>
            <div className="ofi-rail-item">
              <Cara seed="emilio" className="ofi-rail-cara" />
              <span className="ofi-rail-nom">{nombreDe("emilio")} quiere entrar</span>
              <span className="ofi-rail-admitir">Admitir</span>
            </div>
          </div>
        </aside>

        <div className="ofi-main">
          <div className="ofi-toolbar">
            <span className="ofi-toolbar-rot">Selecciona una sala</span>
            <span className="ofi-toolbar-acc">Escuchar todas</span>
            <span className="ofi-toolbar-acc">Hablar a todas</span>
          </div>
          <div className="ofi-grilla">
            {salas.map((s, idx) => (
              <SalaVista
                s={s}
                resaltada={idx === salaResaltada}
                accion={idx === salaResaltada ? accion : undefined}
                paso={paso}
                pantalla={enPantalla(idx, ciclo)}
                key={s.n}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="ofi-tu">
        <Headphones width={14} height={14} strokeWidth={2.2} aria-hidden="true" />
        <span>{pie}</span>
        <span className="ofi-ondas" aria-hidden="true"><i /><i /><i /></span>
      </div>
      </div>
    </div>
  );
}
