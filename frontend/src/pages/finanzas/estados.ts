// Las etiquetas de los estados y tipos de Finanzas, en el idioma de la interfaz.
//
// ⚠️ El estado se GUARDA en español en la base (invoices.status = "pagada",
// commissions.status = "proyectado", payroll_periods.status = "cerrado",
// creator_payments.payment_type = "Adelanto"…): ese valor es el dato con el que
// se filtra, se compara y se imprime en la factura, y no se toca. Acá solo se
// elige cómo se MUESTRA en pantalla. Un valor que no está en la lista se muestra
// tal cual, como antes.
import type { Language, TranslationKey } from "@/lib/i18n";

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

/** "comercial" o "laboral" (commissions.commission_type), para los badges que ya
 *  decían "Comercial"/"Laboral". Como antes, todo lo que no es "comercial" se
 *  muestra como laboral. */
export const tipoComision = (t: Traductor, tipo?: string | null) =>
  tipo === "comercial" ? t("finanzas.commType.commercial") : t("finanzas.commType.labor");

const TIPO_COMISION: Record<string, TranslationKey> = {
  comercial: "finanzas.commType.commercial",
  laboral: "finanzas.commType.labor",
};

/** El commission_type tal como está guardado: "comercial" y "laboral" con su
 *  etiqueta; cualquier otro ("percentage", el que guarda NuevaComisionModal) tal
 *  cual, sin disfrazarlo de laboral. */
export const tipoComisionGuardado = (t: Traductor, tipo?: string | null) => etiqueta(TIPO_COMISION, t, tipo);

// El tipo de una deducción de RRHH (employee_deductions.deduction_type), como lo
// guarda el alta de RRHH (HRDeductionNew). Otro valor se muestra tal cual.
const TIPO_DE_DEDUCCION: Record<string, TranslationKey> = {
  adelanto: "finanzas.dedType.advance",
  infraccion: "finanzas.dedType.infraction",
};

export const tipoDeDeduccion = (t: Traductor, tipo?: string | null) => etiqueta(TIPO_DE_DEDUCCION, t, tipo);

/**
 * ⚠️ Donde la pantalla en español mostraba el valor GUARDADO tal cual, en minúscula
 * ("borrador · Sin CC", "chatters · en_proceso", "Estado: pagado", "Tipo: laboral":
 * los popups de las tarjetas, el detalle de una comisión, los badges de Recibos y
 * Batch de Nómina…), en español se sigue mostrando así, letra por letra; en inglés
 * va la etiqueta. Donde ya había una etiqueta ("Borrador" en los badges de las
 * tablas) se llama directo a la función de arriba.
 */
export const crudoEnEspanol = (
  language: Language,
  etiquetar: (t: Traductor, valor?: string | null) => string,
  t: Traductor,
  valor: string | null | undefined,
): string => (language === "es" ? (valor ?? "") : etiquetar(t, valor));
