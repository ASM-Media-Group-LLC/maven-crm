// Nombres que la gente escribió GRITANDO en mayúsculas ("CHATTERS KASH 2.0",
// "CIERRES - MARKETING", "UNIVERSIDAD KASH") se ven feos en la interfaz. Esto
// los pasa a Título SOLO cuando vienen TODO en mayúsculas; si el nombre ya trae
// minúsculas, se respeta tal como lo escribieron. No cambia el dato guardado:
// es solo para mostrar.
//
// Reglas:
//  · "CHATTERS KASH 2.0"   → "Chatters Kash 2.0"
//  · "CIERRES - MARKETING" → "Cierres - Marketing"
//  · "BRAYAN Y DANIEL"     → "Brayan y Daniel"  (los conectores van en minúscula)
//  · "HR", "QA", "CS"      → se quedan igual (acrónimos cortos)

const CONECTORES = new Set([
  "y", "e", "o", "u", "de", "del", "la", "el", "los", "las",
  "con", "para", "a", "en", "por", "al",
]);

export function tituloBonito(nombre: string | null | undefined): string {
  const s = (nombre ?? "").trim();
  if (!s) return "";
  // ¿Está TODO en mayúsculas? (tiene letras y ninguna es minúscula)
  const todoMayus = s === s.toUpperCase() && s !== s.toLowerCase();
  if (!todoMayus) return s;
  // Acrónimos cortos (3 letras o menos): HR, QA, CS, RRHH no, pero HR sí.
  const letras = (s.match(/\p{L}/gu) ?? []).length;
  if (letras <= 3) return s;
  // Minúsculas y luego primera de cada palabra en mayúscula; los conectores
  // (salvo al inicio) se quedan en minúscula.
  return s.toLowerCase().replace(/\p{L}[\p{L}’']*/gu, (palabra, offset: number) => {
    if (offset > 0 && CONECTORES.has(palabra)) return palabra;
    return palabra.charAt(0).toUpperCase() + palabra.slice(1);
  });
}
