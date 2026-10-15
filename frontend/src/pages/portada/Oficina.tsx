import { useEffect, useState } from "react";
import { Headphones, Monitor, MousePointer2, Users } from "lucide-react";
import { Cara, nombreDe, type Seed } from "./gente";
import type { Publico } from "./guiones";

// LA OFICINA EN VIVO · DEMO QUE SE MANEJA SOLA.
//
// El hero abre con Cowork trabajando: salas abiertas con gente adentro —unos
// hablando, otros tecleando, alguien compartiendo pantalla— y, encima, un
// cursor que recorre el tablero y va MOSTRANDO cómo se usa: escucha una sala
// sin entrar, le habla, entra a otra. Es el "video" de cómo trabaja la
// plataforma, pero reconstruido en vivo (sin grabar nada ni exponer a nadie).
//
// Todo es ILUSTRATIVO: personas inventadas (gente.tsx), nombres de sala
// genéricos, ni un cliente ni una cifra real. Vive dentro del marco `.consola`.

type Estado = "habla" | "trabaja" | "pantalla" | "quieto";
type Persona = { seed: Seed; estado: Estado };
type Sala = { n: string; gente: Persona[]; codigo?: string };

// Dos guiones: la misma oficina contada desde el problema de cada público.
const SALAS: Record<Publico, Sala[]> = {
  empresas: [
    { n: "Ventas", gente: [{ seed: "camilo", estado: "habla" }, { seed: "valentina", estado: "trabaja" }] },
    { n: "Soporte", gente: [{ seed: "luciana", estado: "pantalla" }] },
    { n: "Diseño", gente: [{ seed: "andres", estado: "trabaja" }, { seed: "martina", estado: "trabaja" }] },
    { n: "Turno tarde", gente: [{ seed: "emilio", estado: "quieto" }] },
    { n: "Reunión", gente: [{ seed: "joaquin", estado: "habla" }, { seed: "sofia", estado: "habla" }] },
    { n: "Sala libre", gente: [], codigo: "K7Q2PD" },
  ],
  agencias: [
    { n: "Chat 1", gente: [{ seed: "camilo", estado: "trabaja" }, { seed: "valentina", estado: "habla" }] },
    { n: "Chat 2", gente: [{ seed: "luciana", estado: "pantalla" }] },
    { n: "Promoción", gente: [{ seed: "andres", estado: "trabaja" }, { seed: "martina", estado: "trabaja" }] },
    { n: "Turno tarde", gente: [{ seed: "emilio", estado: "quieto" }] },
    { n: "Cartera", gente: [{ seed: "joaquin", estado: "habla" }, { seed: "sofia", estado: "habla" }] },
    { n: "Sala libre", gente: [], codigo: "K7Q2PD" },
  ],
};

// La barra de actividad del hero (el gráfico "tipo command center"): 12 tramos
// del día, el último encendido. Es ILUSTRATIVA, como el reloj y el conteo.
const BARRAS = [44, 50, 47, 57, 54, 62, 59, 69, 65, 77, 83, 100];

// El guion del recorrido: el cursor va de sala en sala mostrando cómo se usa
// Cowork — escuchar una sin entrar, hablarle, entrar. Se repite en bucle. Las
// salas van por índice para que sirva igual en los dos públicos.
type Accion = "Escuchar" | "Hablar" | "Entrar";
const PASOS: { i: number; accion: Accion }[] = [
  { i: 0, accion: "Escuchar" },
  { i: 2, accion: "Escuchar" },
  { i: 4, accion: "Hablar" },
  { i: 1, accion: "Entrar" },
  { i: 4, accion: "Escuchar" },
];

function SalaVista({ s, resaltada, modo, vozActiva }: { s: Sala; resaltada: boolean; modo?: Accion; vozActiva?: Seed }) {
  const vacia = s.gente.length === 0;
  const habla = s.gente.find((p) => p.estado === "habla");
  const pantalla = s.gente.find((p) => p.estado === "pantalla");
  const trabajan = s.gente.filter((p) => p.estado === "trabaja").length;
  const pie = vacia
    ? `código ${s.codigo}`
    : habla
      ? `${nombreDe(habla.seed)} hablando`
      : pantalla
        ? `${nombreDe(pantalla.seed)} comparte pantalla`
        : trabajan
          ? `${trabajan} trabajando`
          : "en pausa";

  const resalte = resaltada ? (modo === "Hablar" ? " hablando-a" : " escuchando") : "";

  return (
    <div className={`ofi-sala${resalte}${vacia ? " vacia" : ""}`}>
      <div className="ofi-cab">
        <b>{s.n}</b>
        <span>
          {vacia ? "libre" : <><Users width={10} height={10} strokeWidth={2.4} aria-hidden="true" />{s.gente.length}</>}
        </span>
      </div>
      <div className="ofi-escena">
        {vacia ? (
          <span className="ofi-libre">Sala libre</span>
        ) : (
          s.gente.map((p) => (
            <span className={`ofi-persona ${p.estado}${p.seed === vozActiva ? " activa" : ""}`} key={p.seed}>
              <Cara seed={p.seed} className="ofi-cara" />
              {p.estado === "habla" && <span className="ofi-ondas" aria-hidden="true"><i /><i /><i /></span>}
              {p.estado === "trabaja" && <span className="ofi-teclea" aria-hidden="true"><i /><i /><i /></span>}
              {p.estado === "pantalla" && (
                <span className="ofi-pant" aria-hidden="true">
                  <Monitor width={9} height={9} strokeWidth={2.4} />
                </span>
              )}
            </span>
          ))
        )}
      </div>
      <div className="ofi-pie">
        <span>{pie}</span>
        {resaltada && (
          <span className={`ofi-esc${modo === "Hablar" ? " hab" : ""}`}>
            <i />{modo === "Hablar" ? "Hablando" : modo === "Entrar" ? "Entrando" : "Escuchando"}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Oficina({ publico }: { publico: Publico }) {
  const [hora, setHora] = useState("--:--:--");
  const [tick, setTick] = useState(0);
  const [paso, setPaso] = useState(0);

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

  // Un pulso mueve quién tiene la palabra (anima el avatar que habla).
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 2600);
    return () => window.clearInterval(t);
  }, []);

  // El recorrido: cada paso mueve el cursor a una sala y "hace clic".
  useEffect(() => {
    const t = window.setInterval(() => setPaso((p) => (p + 1) % PASOS.length), 2400);
    return () => window.clearInterval(t);
  }, []);

  const salas = SALAS[publico];
  const { i: salaResaltada, accion } = PASOS[paso];
  const escuchada = (salas[salaResaltada] ?? salas[0]).n;
  const hablantes = salas.flatMap((s) => s.gente.filter((p) => p.estado === "habla").map((p) => p.seed));
  const vozActiva = hablantes.length ? hablantes[tick % hablantes.length] : undefined;
  const enSalas = salas.reduce((a, s) => a + s.gente.length, 0);

  // Dónde está el cursor: centro-bajo de la sala que toca (grilla 3×2).
  const col = salaResaltada % 3;
  const fila = Math.floor(salaResaltada / 3);
  const cx = [18, 50, 82][col];
  const cy = fila === 0 ? 45 : 90;

  const pie = accion === "Hablar"
    ? <>Tú · hablando a <b>{escuchada}</b></>
    : accion === "Entrar"
      ? <>Tú · entrando a <b>{escuchada}</b></>
      : <>Tú · escuchando <b>{escuchada}</b> sin entrar</>;

  return (
    <div className="consola">
      <div className="consola-barra">
        <span className="semaforo"><i /><i /><i /></span>
        <span className="consola-titulo">oficina</span>
        <span className="ofi-live"><i />en vivo</span>
        <span className="ofi-cuenta">{enSalas} en salas · {hablantes.length} hablando</span>
        <span className="consola-reloj">{hora}</span>
      </div>
      <div className="ofi-pulso">
        <span className="ofi-pulso-rot">actividad · hoy</span>
        <div className="ofi-barras" aria-hidden="true">
          {BARRAS.map((h, i) => (
            <i
              key={i}
              className={i === BARRAS.length - 1 ? "viva" : ""}
              style={{ height: `${h}%`, animationDelay: `${i * 0.13}s` }}
            />
          ))}
        </div>
      </div>
      <div className="ofi" aria-label="Oficina en vivo">
        {/* El `key` por público remonta la grilla al cambiar de guión. */}
        <div className="ofi-grilla" key={publico}>
          {salas.map((s, idx) => (
            <SalaVista
              s={s}
              resaltada={idx === salaResaltada}
              modo={idx === salaResaltada ? accion : undefined}
              vozActiva={vozActiva}
              key={s.n}
            />
          ))}
          {/* El cursor que maneja la demo: se desliza a la sala y hace clic. */}
          <span className={`ofi-cursor${accion === "Hablar" ? " hab" : ""}`} style={{ left: `${cx}%`, top: `${cy}%` }} aria-hidden="true">
            <span className="ofi-accion">{accion}</span>
            <MousePointer2 width={16} height={16} strokeWidth={2.2} fill="currentColor" />
            <span className="ofi-click" key={paso} />
          </span>
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
