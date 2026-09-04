import { Check } from "lucide-react";

// LOS PLANES · solo en el documento comercial (/concept), no en la portada.
//
// ⚠️ ACÁ NO HAY PRECIOS, Y ES A PROPÓSITO.
//
// La versión vieja de esta página publicaba "$299/mes" y "$799/mes" en una
// URL pública, con niveles inventados en su momento. Los niveles de
// suscripción todavía no están decididos, y una tarifa publicada es una
// tarifa que el comprador te va a cobrar en la negociación. Así que la página
// muestra QUÉ CAMBIA entre planes —que es lo que el comprador necesita para
// ubicarse— y la cifra sale en la propuesta.
//
// Cuando Jhon decida los precios, se ponen acá: agregar `precio` a cada plan
// y descomentar la línea del importe. Nada más.

interface Plan {
  nombre: string;
  para: string;
  /** Cuando haya precio decidido, va acá. Sin esto se muestra "a medida". */
  precio?: string;
  destacado?: boolean;
  incluye: string[];
}

const PLANES: Plan[] = [
  {
    nombre: "Equipo",
    para: "Para el equipo que está armando su operación",
    incluye: [
      "Correo con tu dominio",
      "Messenger completo",
      "Cowork y reuniones con grabación",
      "Tickets y anuncios internos",
      "Tablero por persona",
      "Permisos por rol",
    ],
  },
  {
    nombre: "Operación",
    para: "Para cuando el equipo ya no cabe en planillas",
    destacado: true,
    incluye: [
      "Todo lo del plan Equipo",
      "Horarios, turnos y asistencia",
      "Nómina y costo por persona",
      "Ventas, pipeline y cadencia",
      "Bandeja de mensajería externa",
      "La nota diaria por rol, explicada",
      "Agentes que acompañan a cada equipo",
    ],
  },
  {
    nombre: "A medida",
    para: "Para quien necesita la plataforma con su cara",
    incluye: [
      "Todo lo del plan Operación",
      "Marca blanca con tu paleta",
      "Roles y permisos armados contigo",
      "Integraciones con lo que ya usas",
      "Acompañamiento en la migración",
      "Retención y auditoría a tu medida",
    ],
  },
];

export default function Planes() {
  return (
    <section className="bloque" id="planes" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="wrap">
        <div className="cabeza">
          <span className="eyebrow">planes</span>
          <h2>Se cobra por lo que usas, no por asiento de nadie más.</h2>
          <p>
            El correo, el video, la mensajería y la transcripción corren sobre servicios propios,
            así que no hay una renta por persona escondida detrás. La propuesta se arma según el
            tamaño del equipo y qué áreas van a usar.
          </p>
        </div>

        <div className="planes">
          {PLANES.map((p) => (
            <div className={`plan${p.destacado ? " destacado" : ""}`} key={p.nombre}>
              {p.destacado ? <span className="etiqueta">el más pedido</span> : null}
              <h3>{p.nombre}</h3>
              <p className="para">{p.para}</p>
              <p className="precio">{p.precio ?? "Propuesta a medida"}</p>
              <ul>
                {p.incluye.map((i) => (
                  <li key={i}>
                    <Check width={13} height={13} strokeWidth={3} aria-hidden="true" />
                    {i}
                  </li>
                ))}
              </ul>
              <a className="btn btn-fantasma" href="#demo">Pedir la propuesta</a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
