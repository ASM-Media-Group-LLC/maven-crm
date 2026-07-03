// Degradé VIBRANTE determinista por contacto para avatares sin foto — el mismo
// sistema en la bandeja WhatsApp, el Messenger y (a futuro) Telegram, como el
// mockup del sistema de diseño. Evita que todos los avatares sin foto caigan al
// mismo color apagado. Decorativo (identidad por contacto), no semántico.
export const AVATAR_GRADIENTS = [
  "from-violet-500 to-blue-500",
  "from-pink-500 to-orange-400",
  "from-teal-400 to-blue-600",
  "from-fuchsia-500 to-indigo-500",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-cyan-500 to-blue-500",
  "from-indigo-500 to-purple-600",
  "from-sky-500 to-violet-600",
];

// Hash determinista (djb2-ish) → índice de la paleta. Estable entre renders para
// una misma clave (id de conversación / de usuario / nombre).
export function avatarGradient(key: string | null | undefined): string {
  const s = key || "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}
