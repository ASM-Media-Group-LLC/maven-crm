// promoResult — fuente ÚNICA de verdad para mapear el `promoted` crudo de un
// promolog_entry a un resultado BINARIO Sí/No, más los dos marcadores ADITIVOS que
// nunca reemplazan el resultado: "revisar" (needs_review) y "no verificado" (pending).
//
// Por qué existe: antes había 3 copias de `promotedToResult` (Content/Calendar/
// AgentDetail) + varios mapas de badge de 4 estados. Derivaban entre sí y producían
// "Parcial"/"Pendiente" como resultados propios. El owner necesita SIEMPRE Sí o No;
// las alertas (revisar / lectura no confirmada) van como marca al costado, no como
// el resultado. La fila en DB conserva promoted='pending' (para la cola de revisión
// y para re-intentar), pero en pantalla se muestra como "No · no verificado".

export type PromoResult = "Sí" | "No";

// 'true'/'yes' = promocionó; 'partial' (legacy: alguna story sí) también cuenta como Sí.
const PROMO = new Set(["true", "yes", "partial"]);
// lecturas CONFIRMADAS (vimos el perfil): promo o no-promo real.
const CONFIRMED = new Set(["true", "yes", "partial", "false"]);

export const promotedToResult = (promoted: string | null | undefined): PromoResult =>
  PROMO.has(String(promoted ?? "").toLowerCase().trim()) ? "Sí" : "No";

// "No verificado" = la lectura NO fue confirmada (falló / cuenta privada sin follow /
// IA ilegible). Se muestra como No pero con una marca para que un humano lo re-chequee.
// NO confirma que la creadora no haya publicado.
export const isUnverified = (promoted: string | null | undefined): boolean =>
  !CONFIRMED.has(String(promoted ?? "").toLowerCase().trim());

export const resultBadgeVariant = (result: string): "success-soft" | "destructive-soft" =>
  result === "Sí" ? "success-soft" : "destructive-soft";
