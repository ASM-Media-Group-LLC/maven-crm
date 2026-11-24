// Miniaturas sintéticas para las tarjetas reales de Argos. No hay fotos ni datos de empleados.
const colores = {
  fondo: "#101927",
  panel: "#182537",
  borde: "#26374b",
  texto: "#e2eaf6",
  secundario: "#9bafc6",
  azul: "#71aeff",
};

export function capturaDeEjemplo(aplicacion: string, filas: string[]): string {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 450;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const caja = (
    color: string,
    x: number,
    y: number,
    ancho: number,
    alto: number,
  ) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, ancho, alto);
  };
  const texto = (
    etiqueta: string,
    x: number,
    y: number,
    tamaño: number,
    color: string,
  ) => {
    ctx.font = `${tamaño}px system-ui`;
    ctx.fillStyle = color;
    ctx.fillText(etiqueta, x, y);
  };

  caja(colores.fondo, 0, 0, 800, 450);
  caja(colores.panel, 0, 0, 800, 60);
  caja(colores.panel, 0, 60, 198, 390);
  texto("Maven", 24, 38, 21, colores.texto);
  texto(aplicacion, 220, 38, 17, colores.texto);
  ["Cowork", "Messenger", "Meet", "Documentos", "Horarios"].forEach(
    (nombre, indice) => {
      const y = 101 + indice * 48;
      caja(indice === 0 ? "#24476d" : colores.borde, 20, y - 13, 12, 12);
      texto(nombre, 46, y, 15, colores.secundario);
    },
  );
  filas.forEach((fila, indice) => {
    const y = 90 + indice * 80;
    caja(colores.panel, 220, y, 550, 63);
    caja(indice === 0 ? colores.azul : colores.borde, 238, y + 18, 6, 24);
    texto(fila, 258, y + 30, 17, colores.texto);
    texto("Equipo de ejemplo", 258, y + 49, 12, colores.secundario);
  });
  return canvas.toDataURL("image/png");
}
