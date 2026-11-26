export interface PersonaVistaArgos {
  id: string;
  nombre: string;
  iniciales: string;
  equipo: string;
  puesto: string;
  turno: string;
  inicio: string;
  fin: string;
  marca: string | null;
  ubicacion: string | null;
  observacion: { app: string; actividad: string; hora: string } | null;
  conectada: boolean;
  imagen: string | null;
  pendientes: number;
}

export type TurnoVistaArgos = "AM" | "PM" | "Próximas entradas";

export interface PropsVistaArgos {
  personas: PersonaVistaArgos[];
  corte: string;
  buscando?: boolean;
  historico?: boolean;
  abrirPersona: (id: string) => void;
  abrirPantalla: (id: string) => void;
  abrirTurno: (turno: TurnoVistaArgos) => void;
}
