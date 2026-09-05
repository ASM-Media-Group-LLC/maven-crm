import {
  AlertTriangle, Check, Copy, Headphones, Link2, LayoutPanelLeft, Monitor,
  Pencil, Power, Send, Share2, SlidersHorizontal, Users, X,
} from "lucide-react";
import { Cara, type Seed } from "../gente";

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

type Sala = { n: string; gente: number; comparte?: string; cam?: Seed; apagadas?: boolean; codigo: string };

const SALAS: Sala[] = [
  { n: "SALA 1", gente: 1, comparte: "Camilo", cam: "camilo", codigo: "T2GEGG" },
  { n: "SALA 2", gente: 0, codigo: "ZAZD6V" },
  { n: "SALA 3", gente: 2, apagadas: true, codigo: "8RBV2E" },
  { n: "SALA 4", gente: 1, cam: "valentina", codigo: "H6WYPU" },
  { n: "SALA 5", gente: 0, codigo: "5H6X8V" },
  { n: "SALA 6", gente: 0, codigo: "2CT3Y7" },
  { n: "TARDE 1", gente: 1, cam: "luciana", codigo: "CWTXKX" },
  { n: "TARDE 2", gente: 0, codigo: "JVTW25" },
  { n: "TARDE 3", gente: 0, codigo: "MEXS5Y" },
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
        {s.comparte ? `Compartiendo: ${s.comparte}` : "Sin pantalla compartida"}
      </p>
      {s.cam ? (
        <div className="pantalla">
          <Cara seed={s.cam} className="cara-cam" />
          <span className="quien-cam">{s.comparte ?? s.n}</span>
        </div>
      ) : (
        <div className="pantalla vacia">
          <span className="sin">{s.apagadas ? "Cámaras apagadas" : "Sin participantes"}</span>
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
                  3 salas con gente
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
                      Solicitudes (0)
                    </span>
                    <p>Sin solicitudes pendientes</p>
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
              <div className="hub-tit">Hub del supervisor <span>1 participante</span></div>
              <div className="hub-escena">
                <span className="fl izq">‹</span>
                <span className="yo">JL</span>
                <span className="fl der">›</span>
                <span className="espera">Esperando a que se unan los demás…</span>
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
