// Las etiquetas de los estados y tipos de Finanzas, en el idioma de la interfaz.
//
// ⚠️ El estado se GUARDA en español en la base (invoices.status = "pagada",
// commissions.status = "proyectado", payroll_periods.status = "cerrado",
// creator_payments.payment_type = "Adelanto"…): ese valor es el dato con el que
// se filtra, se compara y se imprime en la factura, y no se toca. Acá solo se
// elige cómo se MUESTRA en pantalla. Un valor que no está en la lista se muestra
// tal cual, como antes.
import type { TranslationKey } from "@/lib/i18n";

export type Traductor = (key: TranslationKey, params?: Record<string, string | number>) => string;

const FACTURA: Record<string, TranslationKey> = {
  borrador: "finanzas.status.invoice.draft",
  enviada: "finanzas.status.invoice.sent",
  pagada: "finanzas.status.invoice.paid",
  parcial: "finanzas.status.invoice.partial",
  vencida: "finanzas.status.invoice.overdue",
  reversada: "finanzas.status.invoice.reversed",
  cancelada: "finanzas.status.invoice.canceled",
};

const COMISION: Record<string, TranslationKey> = {
  proyectado: "finanzas.status.commission.projected",
  confirmado: "finanzas.status.commission.confirmed",
  pagado: "finanzas.status.commission.paid",
  pendiente: "finanzas.status.commission.pending",
  en_proceso: "finanzas.status.commission.inProcess",
};

const NOMINA: Record<string, TranslationKey> = {
  borrador: "finanzas.status.payroll.draft",
  calculado: "finanzas.status.payroll.calculated",
  cerrado: "finanzas.status.payroll.closed",
  pagado: "finanzas.status.payroll.paid",
};

const NOTA_DE_PAGO: Record<string, TranslationKey> = {
  pending: "finanzas.status.note.pending",
  paid: "finanzas.status.note.paid",
  cancelled: "finanzas.status.note.canceled",
};

const TIPO_DE_PAGO: Record<string, TranslationKey> = {
  Standard: "finanzas.note.type.standard",
  Adelanto: "finanzas.note.type.advance",
  Bonus: "finanzas.note.type.bonus",
  Ajuste: "finanzas.note.type.adjustment",
};

// El método de pago de una nota (creator_payments.payment_method) o de un invoice
// (invoices.payment_method: "quincenal" para los que se cobran cada 15 días, "cobro"
// para los que se registran en Collections).
const METODO_DE_PAGO: Record<string, TranslationKey> = {
  PayPal: "finanzas.method.paypal",
  Transferencia: "finanzas.method.transfer",
  Crypto: "finanzas.method.crypto",
  Otro: "finanzas.method.other",
  quincenal: "finanzas.method.biweekly",
  mensual: "finanzas.method.monthly",
  cobro: "finanzas.method.collection",
};

function etiqueta(mapa: Record<string, TranslationKey>, t: Traductor, valor?: string | null): string {
  if (!valor) return "—";
  const clave = mapa[valor];
  return clave ? t(clave) : valor;
}

export const estadoFactura = (t: Traductor, estado?: string | null) => etiqueta(FACTURA, t, estado);
export const estadoComision = (t: Traductor, estado?: string | null) => etiqueta(COMISION, t, estado);
export const estadoNomina = (t: Traductor, estado?: string | null) => etiqueta(NOMINA, t, estado);
export const estadoNotaDePago = (t: Traductor, estado?: string | null) => etiqueta(NOTA_DE_PAGO, t, estado);
export const tipoDePago = (t: Traductor, tipo?: string | null) => etiqueta(TIPO_DE_PAGO, t, tipo);
export const metodoDePago = (t: Traductor, metodo?: string | null) => etiqueta(METODO_DE_PAGO, t, metodo);

/** "comercial" o "laboral" (commissions.commission_type). Como antes, todo lo que
 *  no es "comercial" se muestra como laboral. */
export const tipoComision = (t: Traductor, tipo?: string | null) =>
  tipo === "comercial" ? t("finanzas.commType.commercial") : t("finanzas.commType.labor");
