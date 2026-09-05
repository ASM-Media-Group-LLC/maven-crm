import {
  Check, FileText, Image as ImagenIco, Link2, Megaphone, MessageSquareQuote, Mic,
  MoreVertical, Paperclip, PartyPopper, PhoneCall, PictureInPicture2, Plus, Search,
  Send, Smile, Star, Trophy, Type, Users, Video,
} from "lucide-react";
import { Cara } from "../gente";

// MESSENGER.
//
// La maqueta está reconstruida en HTML mirando la pantalla real: los chips de
// acceso rápido, las secciones con su contador, la barra de emojis sobre el
// composer y la fila de iconos con Scripts. No es una captura — así se ve
// como el producto sin publicar una sola conversación de nadie.

// Las fichitas de arriba son la CAPA DE JUEGO: lo que hace que el chat se use
// por gusto y no por obligación. Cada una existe en el producto —las
// estrellas de karma, la dorada que se enciende cuando la vota el 70% del
// equipo, el confeti de un cierre— así que nada de esto es promesa.
const GRACIAS = [
  { Icono: Star, clase: "ambar", texto: "Estrellas de karma entre compañeros" },
  { Icono: Trophy, clase: "ambar", texto: "Estrella dorada que vota el equipo" },
  { Icono: PartyPopper, clase: "verde", texto: "Celebra los cierres" },
  { Icono: Smile, clase: "violeta", texto: "Stickers propios" },
  { Icono: PictureInPicture2, clase: "", texto: "Ventana flotante" },
  { Icono: PhoneCall, clase: "verde", texto: "Timbre de teléfono de verdad" },
  { Icono: Users, clase: "rosa", texto: "Grupos por permisos" },
  { Icono: MessageSquareQuote, clase: "", texto: "Modo solo lectura" },
];

// Cuatro, no más: lo que ya se VE en la maqueta (hilos, álbum, reacciones) no se repite en texto.
const PORQUES = [
  ["El visto no miente", "Un tilde es enviado, dos es leído — y la presencia se pone en ausente cuando dejas la pestaña, en lugar de mostrarte disponible mientras almuerzas."],
  ["Los borradores sobreviven", "Escribes medio mensaje, te llaman, cambias de conversación y vuelves: sigue ahí. Cada conversación guarda el suyo."],
  ["Grupos con candado", "Quién puede escribir, quién puede agregar gente y quién puede editar el grupo se define por separado. Como en un grupo de trabajo de verdad."],
  ["Nada se borra sin dejar rastro", "Un mensaje eliminado desaparece para el equipo, pero un administrador puede ver qué decía. En un chat de trabajo eso no es opcional."],
] as const;

export default function Messenger() {
  return (
    <section className="bloque" id="messenger" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="wrap">
        <div className="cabeza">
          <span className="eyebrow">messenger</span>
          <h2>El mejor messenger empresarial del mercado. Y el único chat de trabajo gamificado.</h2>
          <p>
            Estrellas que se ganan entre compañeros, la dorada que vota el equipo, celebraciones
            cuando algo se cierra y detalles escondidos para quien los encuentre. Debajo, todo lo
            serio: permisos por grupo, modo solo lectura, hilos y ventana flotante.
          </p>
          <div className="gracias">
            {GRACIAS.map(({ Icono, clase, texto }) => (
              <span className={`gracia ${clase}`} key={texto}>
                <Icono strokeWidth={2.2} aria-hidden="true" />
                {texto}
              </span>
            ))}
          </div>
        </div>

        <div className="con-mock">
          <div className="porques">
            {PORQUES.map(([titulo, detalle]) => (
              <div className="porque" key={titulo}>
                <span className="tic">
                  <Check width={13} height={13} strokeWidth={3} stroke="#10b981" aria-hidden="true" />
                </span>
                <span><b>{titulo}</b><span>{detalle}</span></span>
              </div>
            ))}
          </div>

          <div className="marco">
            <div className="marco-barra">
              <span className="semaforo"><i /><i /><i /></span>
              <span className="tit">messenger</span>
              <span className="der" style={{ font: "400 10.5px/1 'JetBrains Mono',monospace", color: "var(--faint)" }}>
                4 no leídos
              </span>
            </div>

            <div className="mg">
              <div className="mg-lista">
                <div className="mg-presencia">
                  <span className="punto" style={{ width: 6, height: 6, animation: "none" }} /> Disponible
                  <span className="mas"><Plus width={12} height={12} /></span>
                </div>
                <div className="mg-buscar">
                  <Search width={11} height={11} strokeWidth={2.4} aria-hidden="true" />
                  Buscar en todos los chats…
                </div>

                <p className="mg-rot">▾ Acceso rápido</p>
                <div className="mg-chips">
                  <span className="on">Todos</span>
                  <span>No leídos <b>4</b></span>
                  <span>Menciones</span>
                  <span>Fijados</span>
                  <span>Archivados</span>
                </div>

                <p className="mg-rot">▾ Mensajes directos <span className="cuenta">25</span></p>
                <div className="mg-fila on">
                  <Cara seed="valentina" />
                  <span className="quien"><b>Valentina</b><span>te paso el dato 👍</span></span>
                  <span className="der"><span className="hora">Ayer</span></span>
                </div>
                <div className="mg-fila">
                  <Cara seed="andres" />
                  <span className="quien"><b>Andrés</b><span>✏️ Borrador: sobre el turno…</span></span>
                  <span className="der"><span className="hora">Ayer</span></span>
                </div>
                <div className="mg-fila">
                  <Cara seed="luciana" />
                  <span className="quien"><b>Luciana</b><span>Sin mensajes</span></span>
                </div>
                <div className="mg-fila">
                  <Cara seed="emilio" />
                  <span className="quien"><b>Emilio</b><span>¿lo cerramos hoy?</span></span>
                  <span className="der"><span className="nl">1</span></span>
                </div>
                <div className="mg-mas">⇕ Mostrar todo · 21 más</div>

                <p className="mg-rot">▾ Grupos <span className="cuenta">3</span></p>
                <div className="mg-fila">
                  <span className="gr" style={{ background: "rgba(var(--violeta-rgb), .18)" }}>
                    <Users width={13} height={13} strokeWidth={2.2} stroke="var(--violeta)" aria-hidden="true" />
                  </span>
                  <span className="quien"><b>Operaciones</b><span>Camilo: quedó listo ✅</span></span>
                  <span className="der"><span className="hora">14:26</span><span className="nl">3</span></span>
                </div>
                <div className="mg-fila">
                  <span className="gr" style={{ background: "rgba(var(--azul-rgb), .18)" }}>
                    <Megaphone width={13} height={13} strokeWidth={2.2} stroke="var(--azul-claro)" aria-hidden="true" />
                  </span>
                  <span className="quien"><b>Anuncios</b><span>Nueva política de turnos</span></span>
                  <span className="der"><span className="mute">🔇 00:19</span></span>
                </div>
                <p className="mg-rot" style={{ paddingTop: 8 }}>▸ Contactos <span className="cuenta">1 en línea</span></p>
              </div>

              <div className="mg-hilo">
                <div className="mg-cab">
                  <span
                    className="gr"
                    style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: "rgba(var(--violeta-rgb), .18)" }}
                  >
                    <Users width={14} height={14} strokeWidth={2.2} stroke="var(--violeta)" aria-hidden="true" />
                  </span>
                  <span><b>Operaciones</b><small>9 personas · solo administradores escriben</small></span>
                  <span className="der">
                    <Video width={14} height={14} strokeWidth={2.2} aria-hidden="true" />
                    <Search width={14} height={14} strokeWidth={2.2} aria-hidden="true" />
                    <MoreVertical width={14} height={14} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                </div>

                <div className="mg-cuerpo">
                  <div className="mb">
                    <Cara seed="camilo" />
                    <span className="glob">
                      <span className="nom">Camilo</span>
                      Subí las fotos del set de ayer, quedaron nueve.
                      <span className="album2"><i /><i /><i>+7</i></span>
                      <span className="hora">14:21</span>
                    </span>
                  </div>
                  <div className="mb mia">
                    <span className="glob">
                      Perfecto. Lo dejo anotado y lo reviso en la reunión.
                      <span className="reacc"><span>👏 3</span><span>✅ 1</span></span>
                      <span className="hora">14:26 <span className="vv">✓✓</span></span>
                    </span>
                  </div>
                  <div className="mb">
                    <Cara seed="martina" />
                    <span className="glob">
                      <span className="nom">Martina</span>
                      ¿Seguimos con lo del cambio de turno acá o abrimos un hilo?
                      <span className="hilo-link">
                        <Link2 width={11} height={11} strokeWidth={2.4} aria-hidden="true" />
                        4 respuestas en el hilo
                      </span>
                      <span className="hora">14:30</span>
                    </span>
                  </div>
                </div>

                <div className="mg-emojis">
                  👍 ❤️ 😂 🙏 🎉 🔥 👏 ✅ 😄 💯 <span className="mas">+ ✎</span>
                </div>
                <div className="mg-input">
                  Sobre el cambio de turno del vier… <em>· borrador guardado</em>
                </div>
                <div className="mg-iconos">
                  <span><Type width={12} height={12} strokeWidth={2.2} aria-hidden="true" /></span>
                  <Paperclip width={13} height={13} strokeWidth={2.2} aria-hidden="true" />
                  <ImagenIco width={13} height={13} strokeWidth={2.2} aria-hidden="true" />
                  <FileText width={13} height={13} strokeWidth={2.2} aria-hidden="true" />
                  <span className="scripts">
                    <MessageSquareQuote width={13} height={13} strokeWidth={2.2} aria-hidden="true" />
                    Scripts
                  </span>
                  <Mic width={13} height={13} strokeWidth={2.2} aria-hidden="true" />
                  <Send width={14} height={14} strokeWidth={2.2} stroke="var(--azul)" style={{ marginLeft: "auto" }} aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
