import { Aperture, Bot, Clock, DollarSign, Mail, Phone, Sparkles, Video } from "lucide-react";

// LO QUE PASA EN LA CINTA DEL HERO.
//
// Son eventos ILUSTRATIVOS del TIPO de cosa que la plataforma hace sola a lo
// largo del día. A propósito no hay una sola cifra ni un solo nombre de
// ninguna empresa que la use: lo que se vende es la clase de trabajo que se
// hace sin que nadie lo empuje, no la operación de nadie.
//
// Hay dos guiones porque la misma plataforma se le cuenta distinto a una
// empresa y a una agencia. Cambiar el guión es más honesto que prometer dos
// productos distintos.

export type Publico = "empresas" | "agencias";

type Tipo = "promo" | "plata" | "turno" | "call" | "nota" | "bot" | "sala" | "correo";

export const ICONOS: Record<Tipo, { color: string; fondo: string; Icono: typeof Bot }> = {
  promo: { color: "#a78bfa", fondo: "rgba(139,92,246,.16)", Icono: Aperture },
  plata: { color: "#10b981", fondo: "rgba(16,185,129,.16)", Icono: DollarSign },
  turno: { color: "#4fa8ff", fondo: "rgba(79,168,255,.16)", Icono: Clock },
  call: { color: "#f43f7e", fondo: "rgba(244,63,126,.16)", Icono: Phone },
  nota: { color: "#f59e0b", fondo: "rgba(245,158,11,.16)", Icono: Sparkles },
  bot: { color: "#a78bfa", fondo: "rgba(139,92,246,.16)", Icono: Bot },
  sala: { color: "#4fa8ff", fondo: "rgba(79,168,255,.16)", Icono: Video },
  correo: { color: "#b9bfcd", fondo: "rgba(255,255,255,.08)", Icono: Mail },
};

export type Evento = { hora: string; tipo: Tipo; texto: React.ReactNode };

const q = (t: string) => <span className="quien">· {t}</span>;

export const GUIONES: Record<Publico, Evento[]> = {
  empresas: [
    { hora: "07:00", tipo: "bot", texto: <><b>Apertura del día</b> publicada en los grupos de cada equipo</> },
    { hora: "07:42", tipo: "turno", texto: <>Turno de la mañana abierto {q("cobertura completa")}</> },
    { hora: "08:15", tipo: "correo", texto: <>Correo entrante convertido en ticket {q("asignado solo")}</> },
    { hora: "09:03", tipo: "sala", texto: <>Sala de trabajo abierta {q("encuadre y audio en verde")}</> },
    { hora: "09:14", tipo: "bot", texto: <>Dos compromisos <b>sin avance</b> hace tres días {q("avisado al líder")}</> },
    { hora: "10:26", tipo: "call", texto: <>Llamada transcrita y puntuada {q("rúbrica del equipo")}</> },
    { hora: "11:00", tipo: "bot", texto: <>Corte de las once {q("respondieron casi todos")}</> },
    { hora: "11:48", tipo: "correo", texto: <>Lista por rol actualizada {q("alta de un ingreso")}</> },
    { hora: "12:30", tipo: "sala", texto: <>Reunión con invitado externo {q("enlace que caduca")}</> },
    { hora: "13:05", tipo: "turno", texto: <>Cambio de turno sin huecos {q("descansos respetados")}</> },
    { hora: "14:19", tipo: "nota", texto: <>Feedback del líder registrado {q("suma a la nota del día")}</> },
    { hora: "15:00", tipo: "bot", texto: <>Recordatorio de un pendiente que vence {q("antes de que se pase")}</> },
    { hora: "16:22", tipo: "call", texto: <>Seguimiento reagendado por cadencia {q("sin tocar nada")}</> },
    { hora: "17:00", tipo: "nota", texto: <>Resumen enviado a cada responsable {q("su equipo, no todo")}</> },
    { hora: "18:40", tipo: "sala", texto: <>Reunión grabada {q("con retención automática")}</> },
    { hora: "19:00", tipo: "nota", texto: <>Notas del día publicadas {q("con el desglose de cada una")}</> },
    { hora: "21:15", tipo: "correo", texto: <>Buzones sincronizados {q("sin tocar el proveedor viejo")}</> },
    { hora: "23:40", tipo: "bot", texto: <>Datos del día conciliados {q("listos para la mañana")}</> },
    { hora: "02:00", tipo: "bot", texto: <>Retención aplicada {q("grabaciones vencidas borradas")}</> },
    { hora: "05:30", tipo: "turno", texto: <>Turno de madrugada cerrado {q("sin incidencias")}</> },
  ],
  agencias: [
    { hora: "07:00", tipo: "bot", texto: <><b>Apertura del día</b> publicada en los grupos de cada equipo</> },
    { hora: "07:42", tipo: "turno", texto: <>Turno de la mañana abierto {q("descansos al día")}</> },
    { hora: "08:15", tipo: "promo", texto: <>Publicación detectada en historias {q("con llamado a la acción")}</> },
    { hora: "09:03", tipo: "sala", texto: <>Sala de trabajo abierta {q("encuadre y audio en verde")}</> },
    { hora: "09:14", tipo: "promo", texto: <>Cuentas <b>sin publicar</b> hace varios días {q("avisado al responsable")}</> },
    { hora: "10:26", tipo: "call", texto: <>Llamada transcrita y puntuada {q("rúbrica del equipo")}</> },
    { hora: "11:00", tipo: "bot", texto: <>Corte de las once {q("respondieron casi todos")}</> },
    { hora: "11:48", tipo: "nota", texto: <>Pedido a medida a punto de vencer {q("antes del plazo")}</> },
    { hora: "12:30", tipo: "sala", texto: <>Reunión de cartera grabada {q("retención automática")}</> },
    { hora: "13:05", tipo: "turno", texto: <>Cambio de turno sin huecos {q("cobertura completa")}</> },
    { hora: "14:19", tipo: "promo", texto: <>Score de publicación actualizado {q("por cuenta")}</> },
    { hora: "15:00", tipo: "bot", texto: <>Seguimiento de una cuenta en silencio {q("al responsable")}</> },
    { hora: "16:22", tipo: "call", texto: <>Contacto reagendado por cadencia {q("sin tocar nada")}</> },
    { hora: "17:00", tipo: "nota", texto: <>Resumen enviado a cada responsable {q("su cartera")}</> },
    { hora: "18:40", tipo: "correo", texto: <>Reporte enviado por correo {q("desde tu dominio")}</> },
    { hora: "19:00", tipo: "nota", texto: <>Notas del día publicadas {q("con el desglose de cada una")}</> },
    { hora: "21:15", tipo: "promo", texto: <>Ranking del equipo recalculado {q("por resultado propio")}</> },
    { hora: "23:40", tipo: "bot", texto: <>Datos del día conciliados {q("listos para la mañana")}</> },
    { hora: "02:00", tipo: "bot", texto: <>Retención aplicada {q("grabaciones vencidas borradas")}</> },
    { hora: "05:30", tipo: "turno", texto: <>Turno de madrugada cerrado {q("sin incidencias")}</> },
  ],
};

export const TITULOS: Record<Publico, string> = {
  empresas: "operación · en vivo",
  agencias: "cartera · en vivo",
};

export const PIES: Record<Publico, string> = {
  empresas: "En producción todos los días, con equipos distribuidos en varios países.",
  agencias: "Nació dentro de una agencia en operación: cada pantalla existe porque alguien la necesitaba.",
};
