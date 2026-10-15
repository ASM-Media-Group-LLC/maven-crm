import { useEffect, useState } from "react";
import { Headphones, Monitor, Users } from "lucide-react";
import { Cara, nombreDe, type Seed } from "./gente";
import type { Publico } from "./guiones";

// LA OFICINA EN VIVO.
//
// El hero abre con la oficina misma y no con una lista de eventos: lo que se
// vende es Cowork + control. Son salas abiertas con gente adentro —unos
// hablando, otros tecleando, alguien compartiendo pantalla— y una persona
// (quien supervisa) escuchando una sala sin entrar. Esa última línea es la
// prueba del control, por eso va fija abajo y cambia de sala sola.
//
// Todo es ILUSTRATIVO: personas inventadas (gente.tsx), nombres de sala
// genéricos, ni un cliente ni una cifra real. Vive dentro del mismo marco
// `.consola` que la cinta anterior y mide lo mismo de alto (372px), así el
// hero no salta al cambiar de público.

type Estado = "habla" | "trabaja" | "pantalla" | "quieto";
type Persona = { seed: Seed; estado: Estado };
type Sala = { n: string; gente: Persona[]; codigo?: string };

// Dos guiones, como en la cinta: la misma oficina contada desde el problema de
// cada público. Las salas de agencia hablan de chats y cartera; las de empresa,
// de ventas y soporte.
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
// del día, el último encendido. Es ILUSTRATIVA, como el reloj y el conteo — no
// es una cifra real de nadie.
const BARRAS = [44, 50, 47, 57, 54, 62, 59, 69, 65, 77, 83, 100];

function SalaVista({ s, escuchada, vozActiva }: { s: Sala; escuchada: boolean; vozActiva?: Seed }) {
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

  return (
    <div className={`ofi-sala${escuchada ? " escuchando" : ""}${vacia ? " vacia" : ""}`}>
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
        {escuchada && <span className="ofi-esc"><i />Escuchando</span>}
      </div>
    </div>
  );
}

export default function Oficina({ publico }: { publico: Publico }) {
  const [hora, setHora] = useState("--:--:--");
  const [tick, setTick] = useState(0);

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

  // Un solo pulso mueve todo: quién tiene la palabra (cada 2,6 s) y qué sala
  // escucha quien supervisa (cada dos pulsos). Así la oficina "respira" sin
  // que haga falta un guión de eventos.
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 2600);
    return () => window.clearInterval(t);
  }, []);

  const salas = SALAS[publico];
  const conGente = salas.filter((s) => s.gente.length > 0);
  const escuchada = (conGente[Math.floor(tick / 2) % conGente.length] ?? salas[0]).n;
  const hablantes = salas.flatMap((s) => s.gente.filter((p) => p.estado === "habla").map((p) => p.seed));
  const vozActiva = hablantes.length ? hablantes[tick % hablantes.length] : undefined;
  const enSalas = salas.reduce((a, s) => a + s.gente.length, 0);

  return (
    <div className="consola">
      <div className="consola-barra">
        <span className="semaforo"><i /><i /><i /></span>
        <span className="consola-titulo">oficina · en vivo</span>
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
              style={{ height: `${h}%`, animationDelay: `${i * 45}ms` }}
            />
          ))}
        </div>
      </div>
      <div className="ofi" aria-label="Oficina en vivo">
        {/* El `key` por público remonta la grilla: cambia el guión sin que se
            vea a medio camino una sala del otro público. */}
        <div className="ofi-grilla" key={publico}>
          {salas.map((s) => (
            <SalaVista s={s} escuchada={s.n === escuchada} vozActiva={vozActiva} key={s.n} />
          ))}
        </div>
        <div className="ofi-tu">
          <Headphones width={14} height={14} strokeWidth={2.2} aria-hidden="true" />
          <span>Tú · escuchando <b>{escuchada}</b> sin entrar</span>
          <span className="ofi-ondas" aria-hidden="true"><i /><i /><i /></span>
        </div>
      </div>
    </div>
  );
}
