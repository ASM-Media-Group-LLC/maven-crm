import {
  AlertTriangle, Check, Copy, Headphones, Link2, LayoutPanelLeft, Monitor,
  Pencil, Power, Send, Share2, SlidersHorizontal, Users, X,
} from "lucide-react";
import { Cara, nombreDe, type Seed } from "../gente";

// COWORK · EL TABLERO DEL SUPERVISOR.
//
// Ojo con "arreglar" esta maqueta convirtiéndola en una grilla de caritas:
// eso sería una videollamada, y Cowork NO es eso. Es un tablero de SALAS,
// cada una con su previsualización, sus controles de escuchar/hablar y su
// código para entrar. Lo que se vende es una persona mirando nueve salas a la
// vez, y esa es la razón por la que la tarjeta tiene la forma que tiene.
//
// Encima del tablero flotan dos ventanas: el Hub del supervisor (su propia
// sesión, que se queda al frente) y un mensaje directo abierto — que es la
// prueba de "el chat de Maven mientras estás en Cowork".

// Cada sala con gente adentro. Unas en cámara, otras compartiendo pantalla:
// eso es lo que se vende, un turno entero trabajando acompañado y a la vista.
type Sala = {
  n: string; codigo: string; gente: number;
  comparte?: { seed: Seed; titulo: string }; // alguien comparte su pantalla
  caras?: Seed[];                             // o están en cámara
};

const SALAS: Sala[] = [
  { n: "SALA 1", codigo: "T2GEGG", gente: 3, comparte: { seed: "camilo", titulo: "Panel de ventas" } },
  { n: "SALA 2", codigo: "ZAZD6V", gente: 2, caras: ["valentina", "andres"] },
  { n: "SALA 3", codigo: "8RBV2E", gente: 2, caras: ["emilio", "sofia"] },
  { n: "SALA 4", codigo: "H6WYPU", gente: 4, comparte: { seed: "martina", titulo: "Diseño · campaña" } },
  { n: "SALA 5", codigo: "5H6X8V", gente: 1, caras: ["joaquin"] },
  { n: "SALA 6", codigo: "2CT3Y7", gente: 2, caras: ["luciana", "camilo"] },
  { n: "TARDE 1", codigo: "CWTXKX", gente: 2, caras: ["andres", "martina"] },
  { n: "TARDE 2", codigo: "JVTW25", gente: 1, caras: ["sofia"] },
  { n: "TARDE 3", codigo: "MEXS5Y", gente: 2, comparte: { seed: "luciana", titulo: "Reporte del día" } },
];

// Tres + "la llamada te sigue". Lo que la maqueta ya muestra (pantallas en vivo) o que ya
// dijeron las cifras y el mapa de módulos (sin instalar nada, grabaciones) no vuelve acá.
const PORQUES = [
  ["Escuchar sin entrar", "Se oye lo que pasa en una sala sin abrir la puerta, y se habla a una o a todas con un botón. El equipo no siente que alguien se metió."],
  ["Cada sala con su código", "Se comparte un código y la persona entra directo, sin invitaciones ni calendarios. Las salas se crean y se cierran en el momento."],
  ["El chat va encima", "Desde el mismo tablero se busca a alguien y se le escribe en una ventanita, sin salir de la sesión ni abrir otra pestaña."],
] as const;

function TarjetaSala({ s }: { s: Sala }) {
  const conGente = s.gente > 0;
  return (
    <div className={`cwx-sala${conGente ? " con-gente" : ""}`}>
      <div className="cab">
        <b>{s.n}</b>
        <span className="n-gente">{s.gente} 👤</span>
        <span className="accion"><Pencil width={10} height={10} aria-hidden="true" /></span>
        <span className="accion"><X width={10} height={10} aria-hidden="true" /></span>
      </div>
      <p className={`comp${s.comparte ? " si" : ""}`}>
        {s.comparte ? `Compartiendo: ${nombreDe(s.comparte.seed)}` : `${s.gente} en cámara`}
      </p>
      {s.comparte ? (
        <div className="pantalla compartiendo">
          <div className="cwx-screen" aria-hidden="true">
            <span className="ss-bar"><i /><i /><i /></span>
            <div className="ss-body">
              <span className="l t" /><span className="l" /><span className="l" />
              <div className="ss-chart"><i /><i /><i /><i /><i /></div>
            </div>
          </div>
          <span className="ss-quien">
            <Cara seed={s.comparte.seed} className="ss-cara" />
            {nombreDe(s.comparte.seed)} · {s.comparte.titulo}
          </span>
        </div>
      ) : (
        <div className="pantalla">
          <span className="cam-gente">
            {(s.caras ?? []).slice(0, 2).map((c) => <Cara seed={c} className="cara-cam" key={c} />)}
          </span>
          <span className="quien-cam">
            {nombreDe((s.caras ?? ["camilo"])[0])}{s.gente > 1 ? ` +${s.gente - 1}` : ""}
          </span>
        </div>
      )}
      <div className="par">
        <span className={conGente ? "activo" : ""}>Escuchando</span>
        <span className={conGente ? "hablar" : ""}>Hablar</span>
      </div>
      <div className="par"><span>Cámara</span><span>Pantalla</span></div>
      <div className="entrar">
        <b>Entrar</b>
        <i><Share2 width={11} height={11} aria-hidden="true" /></i>
      </div>
      <div className="codigo">
        <Link2 width={10} height={10} aria-hidden="true" /> {s.codigo}
        <Copy width={10} height={10} aria-hidden="true" />
      </div>
    </div>
  );
}

export default function Cowork() {
  return (
    <section className="bloque" id="cowork" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="wrap">
        <div className="cabeza">
          <span className="eyebrow">cowork</span>
          <h2>Nueve salas en una pantalla, y una persona mirándolas todas.</h2>
          <p>
            No es una videollamada que alguien convoca: son salas abiertas donde cada turno
            trabaja acompañado. Quien supervisa las ve todas a la vez, escucha una sin entrar,
            habla a todas de golpe, o entra a la que hace falta.
          </p>
        </div>

        <div className="mock-ancho">
          <div className="sigue">
            <div className="marco">
              <div className="marco-barra">
                <span className="semaforo"><i /><i /><i /></span>
                <span className="tit">cowork · tablero del supervisor</span>
                <span className="der" style={{ font: "400 10.5px/1 'JetBrains Mono',monospace", color: "var(--faint)" }}>
                  9 salas con gente
                </span>
              </div>

              <div className="cwx">
                <div className="cwx-lado">
                  <div className="cwx-sesion">
                    <b>TURNO MAÑANA <Pencil width={11} height={11} strokeWidth={2.2} aria-hidden="true" /></b>
                    <small>Tablero del supervisor</small>
                    <span className="iconos">
                      <LayoutPanelLeft width={14} height={14} strokeWidth={2} aria-hidden="true" />
                      <Share2 width={14} height={14} strokeWidth={2} aria-hidden="true" />
                      <SlidersHorizontal width={14} height={14} strokeWidth={2} aria-hidden="true" />
                      <Power width={14} height={14} strokeWidth={2} aria-hidden="true" />
                    </span>
                  </div>
                  <div className="cwx-hub">
                    <Headphones width={13} height={13} strokeWidth={2.2} stroke="var(--azul-claro)" aria-hidden="true" />
                    Hub del supervisor
                    <span className="min">Minimizar</span>
                  </div>
                  <div className="cwx-grupo">
                    <span className="rot">
                      <AlertTriangle width={11} height={11} strokeWidth={2.4} aria-hidden="true" />
                      Solicitudes (1)
                    </span>
                    <div className="cwx-vivo" style={{ marginTop: 9 }}>
                      <Cara seed="emilio" style={{ width: 20, height: 20, borderRadius: "50%" }} />
                      Emilio quiere entrar
                      <span className="sala-chip" style={{ color: "var(--verde)", borderColor: "rgba(16,185,129,.35)" }}>Admitir</span>
                    </div>
                  </div>
                  <div className="cwx-grupo" style={{ borderBottom: 0 }}>
                    <span className="rot" style={{ color: "var(--rosa)" }}>
                      <Monitor width={11} height={11} strokeWidth={2.2} aria-hidden="true" />
                      Pantallas en vivo
                    </span>
                    <div className="cwx-vivo">
                      <Cara seed="camilo" style={{ width: 20, height: 20, borderRadius: "50%" }} />
                      Camilo
                      <span className="sala-chip">SALA 1</span>
                    </div>
                    <div className="cwx-vivo" style={{ marginTop: 7 }}>
                      <Cara seed="martina" style={{ width: 20, height: 20, borderRadius: "50%" }} />
                      Martina
                      <span className="sala-chip">SALA 4</span>
                    </div>
                  </div>
                </div>

                <div className="cwx-main">
                  <div className="cwx-top">
                    <span className="rot">Seleccione sala para ingresar</span>
                    <span className="acciones-todas">
                      <span>Escuchar todas</span>
                      <span>Hablar a todas</span>
                      <span>Cámara a todas</span>
                      <span>+ Añadir sala</span>
                    </span>
                  </div>
                  <div className="cwx-grilla">
                    {SALAS.map((s) => <TarjetaSala s={s} key={s.n} />)}
                  </div>
                </div>
              </div>
            </div>

            {/* El Hub: la sesión del supervisor, que se queda al frente */}
            <div className="hub">
              <div className="hub-barra">
                <Headphones width={11} height={11} strokeWidth={2.2} aria-hidden="true" />
                Hub del supervisor
                <span className="ctrls">🔊 ▭ − ⤢</span>
              </div>
              <div className="hub-tit">Hub del supervisor <span>4 participantes</span></div>
              <div className="hub-escena activa">
                <span className="hub-mini" aria-hidden="true">
                  <Cara seed="camilo" className="hub-cara habla" />
                  <Cara seed="valentina" className="hub-cara" />
                  <Cara seed="andres" className="hub-cara" />
                </span>
                <span className="yo">JL</span>
                <span className="espera en-vivo">4 en la sesión · Camilo hablando</span>
              </div>
              <div className="hub-pie">Tú 🔇 <span className="sesion-chip">TURNO MAÑANA ⌄</span> ▁▃▅</div>
              <div className="hub-ctrl">
                <i className="off">🎙</i><i className="off">📷</i><i>🖥</i><i>😊</i><i>✋</i><i>ⓘ</i><i>👥</i><i>💬</i>
              </div>
            </div>

            {/* Y el mensaje directo, abierto encima del tablero */}
            <div className="dm-flotante">
              <div className="dm-barra">
                <Cara seed="camilo" />
                Camilo
                <span className="ctrls">⤢ − ✕</span>
              </div>
              <div className="dm-vacio">💬<br />Envía el primer mensaje</div>
              <div className="dm-emojis">👍 ❤️ 😂 🙏 🎉 🔥 👏 ✅</div>
              <div className="dm-input">
                Escribe un mensaje…
                <Send width={12} height={12} strokeWidth={2.2} stroke="var(--azul)" style={{ marginLeft: "auto" }} aria-hidden="true" />
              </div>
              <div className="dm-iconos">📎 🖼 📄 Scripts 🎙</div>
            </div>
          </div>

          <div className="porques">
            {PORQUES.map(([titulo, detalle]) => (
              <div className="porque" key={titulo}>
                <span className="tic" style={{ background: "rgba(var(--azul-claro-rgb), .16)" }}>
                  <Check width={13} height={13} strokeWidth={3} stroke="var(--azul-claro)" aria-hidden="true" />
                </span>
                <span><b>{titulo}</b><span>{detalle}</span></span>
              </div>
            ))}
            <div className="porque">
              <span className="tic" style={{ background: "rgba(var(--azul-claro-rgb), .16)" }}>
                <Users width={13} height={13} strokeWidth={3} stroke="var(--azul-claro)" aria-hidden="true" />
              </span>
              <span>
                <b>Y si te vas, la llamada te sigue</b>
                <span>
                  Al cambiar de sección la sala salta a una ventana del sistema que queda{" "}
                  <b style={{ display: "inline", font: "inherit", fontWeight: 600, color: "var(--ink)" }}>siempre al frente</b>,
                  incluso sobre otros programas. No se reconecta ni se pierde el audio: sigue
                  andando mientras trabajas en otra pantalla.
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
