// VISTA DE PRUEBA (temporal) para ver el nuevo look "consola" del tablero de
// Cowork con datos ficticios, sin necesidad de una sesión en vivo. Es el MISMO
// CSS (tablero.css) que va a usar el tablero real; sirve para que Álvaro apruebe
// el estilo con una captura del app de verdad antes de tocar la herramienta en
// vivo. Una vez aprobado y aplicado, este archivo y su ruta se quitan.
import { Headphones, Users } from "lucide-react";
import "./tablero.css";

const cara = (n: string) => `/portada/caras/${n}.jpg?v=3`;

function Escena({ tipo, cara1, cara2, quien }: { tipo: "cam" | "screen"; cara1?: string; cara2?: string; quien: string }) {
  return (
    <div className="cwk-escena">
      {tipo === "cam" ? (
        <>
          <img src={cara1} alt="" className="cwk-escena-full" />
          {cara2 && <img src={cara2} alt="" className="cwk-escena-pip" />}
          <span className="cwk-voz"><i /><i /><i /></span>
          <span className="cwk-quien"><span className="cwk-live-dot" />{quien}</span>
        </>
      ) : (
        <>
          <div className="cwk-screen" aria-hidden="true">
            <div className="ss-bar"><i /><i /><i /></div>
            <div className="ss-body">
              <span className="l t" /><span className="l" /><span className="l" />
              <div className="ss-chart"><i /><i /><i /><i /><i /></div>
            </div>
          </div>
          <span className="cwk-quien"><span className="cwk-live-dot" /><img src={cara1} alt="" className="cwk-quien-cara" />{quien}</span>
        </>
      )}
    </div>
  );
}

function Sala({ nombre, gente, pie, acc, activa, children }: {
  nombre: string; gente: number; pie: string; acc?: "escuchar" | "hablar" | "entrar"; activa?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={`cwk-sala${activa ? " activa" : ""}`}>
      <div className="cwk-cab">
        <b>{nombre}</b>
        <span className="cwk-gente"><Users width={11} height={11} strokeWidth={2.4} aria-hidden="true" />{gente}</span>
      </div>
      {children}
      <div className="cwk-acciones">
        <span className={`cwk-btn cwk-btn-escuchar${acc === "escuchar" ? " activo" : ""}`}>Escuchar</span>
        <span className={`cwk-btn cwk-btn-hablar${acc === "hablar" ? " activo" : ""}`}>Hablar</span>
        <span className={`cwk-btn cwk-btn-entrar${acc === "entrar" ? " activo" : ""}`}>Entrar</span>
      </div>
      <div className="cwk-codigo">{pie}</div>
    </div>
  );
}

export default function TableroEstiloPreview() {
  return (
    <div className="cwk-tablero" style={{ height: "100dvh" }}>
      <div className="cwk-barra">
        <span className="cwk-semaforo"><i /><i /><i /></span>
        <span className="cwk-titulo">cowork</span>
        <span className="cwk-live"><i />en vivo</span>
        <span className="cwk-cuenta">6 en salas · 3 hablando</span>
        <span className="cwk-reloj">22:20:02</span>
      </div>

      <div className="cwk-board">
        <aside className="cwk-rail">
          <div className="cwk-rail-cab">
            <b>Tablero</b>
            <small>del supervisor</small>
          </div>
          <div className="cwk-rail-sec">
            <span className="cwk-rail-rot">Pantallas en vivo</span>
            <div className="cwk-rail-item">
              <img src={cara("cara-06")} alt="" className="cwk-rail-cara" />
              <span className="cwk-rail-nom">Luciana</span>
              <span className="cwk-rail-chip">Soporte</span>
            </div>
            <div className="cwk-rail-item">
              <img src={cara("cara-07")} alt="" className="cwk-rail-cara" />
              <span className="cwk-rail-nom">Martina</span>
              <span className="cwk-rail-chip">Diseño</span>
            </div>
          </div>
          <div className="cwk-rail-sec">
            <span className="cwk-rail-rot amb">Solicitudes · 1</span>
            <div className="cwk-rail-item">
              <img src={cara("cara-03")} alt="" className="cwk-rail-cara" />
              <span className="cwk-rail-nom">Emilio quiere entrar</span>
              <button className="cwk-rail-admitir">Admitir</button>
            </div>
          </div>
        </aside>

        <div className="cwk-main">
          <div className="cwk-toolbar">
            <span className="cwk-toolbar-rot">Selecciona una sala</span>
            <span className="cwk-toolbar-acc">Escuchar todas</span>
            <span className="cwk-toolbar-acc">Hablar a todas</span>
          </div>
          <div className="cwk-grilla">
            <Sala nombre="Ventas" gente={2} pie="código T2GEGG" acc="escuchar" activa>
              <Escena tipo="cam" cara1={cara("cara-01")} cara2={cara("cara-05")} quien="Camilo +1" />
            </Sala>
            <Sala nombre="Soporte" gente={1} pie="Compartiendo · Luciana" acc="entrar">
              <Escena tipo="screen" cara1={cara("cara-06")} quien="Luciana" />
            </Sala>
            <Sala nombre="Diseño" gente={1} pie="código K4MP2A">
              <Escena tipo="screen" cara1={cara("cara-07")} quien="Martina" />
            </Sala>
            <Sala nombre="Reunión" gente={2} pie="código BR8VZE" acc="hablar">
              <Escena tipo="cam" cara1={cara("cara-04")} cara2={cara("cara-02")} quien="Joaquín +1" />
            </Sala>
          </div>
        </div>
      </div>

      <div className="cwk-pie">
        <Headphones width={15} height={15} strokeWidth={2.2} aria-hidden="true" />
        <span>Tú · escuchando <b>Ventas</b> sin entrar</span>
        <span className="cwk-ondas" aria-hidden="true"><i /><i /><i /></span>
      </div>
    </div>
  );
}
