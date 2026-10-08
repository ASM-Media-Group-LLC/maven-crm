// Reacciones con emoji en el Correo, como Gmail (Keila, 08/10/2026).
//
// Una reacción es un correo corto (su fila tiene `reaccion` con el emoji) que
// responde al mensaje reaccionado. Acá: cómo se juntan en chips debajo de cada
// mensaje y cuándo se puede reaccionar (las mismas reglas que la edge,
// supabase/functions/mail-fetch/reacciones.ts, para apagar el botón ANTES de
// que la persona elija un emoji que después se rechaza).
//
// Suelto, sin React, para poder probarlo.

import type { MailSummary } from "@/hooks/useMailbox";
import { correoDe, direccionesDe, nombreDe } from "@/lib/mailAddr";

export interface ChipDeReaccion {
  emoji: string;
  /** Quiénes, en el orden en que reaccionaron. «yo» va como null. */
  quienes: (string | null)[];
  mia: boolean;
}

/** Las reacciones a `messageId`, juntas por emoji en el orden en que llegó la
 *  primera de cada una. Una persona que reaccionó dos veces con lo mismo cuenta
 *  una vez. `pendientes`: las que acabo de mandar y todavía no volvieron de la
 *  base (se ven al instante, como en Gmail). */
export function chipsDeReacciones(
  reacciones: MailSummary[],
  messageId: string | undefined,
  yo: string,
  pendientes: string[] = [],
): ChipDeReaccion[] {
  if (!messageId) return [];
  const mia = yo.toLowerCase();
  const propias = reacciones
    .filter((r) => r.reaccion && r.inReplyTo === messageId)
    .sort((a, b) => (Date.parse(a.date) || 0) - (Date.parse(b.date) || 0));
  const porEmoji = new Map<string, ChipDeReaccion & { emails: Set<string> }>();
  const sumar = (emoji: string, email: string, nombre: string | null) => {
    const chip = porEmoji.get(emoji) ?? { emoji, quienes: [], mia: false, emails: new Set<string>() };
    if (chip.emails.has(email)) return;
    chip.emails.add(email);
    const esMia = email === mia;
    chip.quienes.push(esMia ? null : nombre);
    if (esMia) chip.mia = true;
    porEmoji.set(emoji, chip);
  };
  for (const r of propias) {
    const email = correoDe(r.from).toLowerCase();
    sumar(r.reaccion!, email, nombreDe(r.from) || email);
  }
  for (const emoji of pendientes) sumar(emoji, mia, null);
  return [...porEmoji.values()].map(({ emoji, quienes, mia: m }) => ({ emoji, quienes, mia: m }));
}

export type PuedeReaccionar = { ok: true } | { ok: false; motivo: "sin_id" | "no_estas" | "muchos" };

/** Las reglas de Google, las mismas que aplica la edge. */
export function puedeReaccionar(m: Pick<MailSummary, "from" | "to" | "cc" | "messageId">, yo: string): PuedeReaccionar {
  if (!m.messageId) return { ok: false, motivo: "sin_id" };
  const mia = yo.toLowerCase();
  const remitente = direccionesDe(m.from ?? "").map((d) => d.toLowerCase());
  const para = direccionesDe(m.to ?? "").map((d) => d.toLowerCase());
  const copia = direccionesDe(m.cc ?? "").map((d) => d.toLowerCase());
  if (![...remitente, ...para, ...copia].includes(mia)) return { ok: false, motivo: "no_estas" };
  const otros = new Set([...remitente, ...para, ...copia]);
  otros.delete(mia);
  if (otros.size > 20) return { ok: false, motivo: "muchos" };
  return { ok: true };
}
