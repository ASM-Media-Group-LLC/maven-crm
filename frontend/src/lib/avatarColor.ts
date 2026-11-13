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
/** Tono (hue) propio de cada persona para las INICIALES SUAVES de UserAvatar
 *  (Alvaro, 12/11/2026: «demasiado prendidos los colores»). Doce tonos escogidos
 *  a mano para que ninguno salga barroso; el color lo pone .avatar-iniciales
 *  (index.css): pastel en claro, apagado en oscuro. */
const TONOS_AVATAR = [212, 160, 28, 268, 340, 190, 135, 248, 8, 300, 45, 176];
export function tonoDeAvatar(key: string | null | undefined): number {
  const s = (key || "?").trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TONOS_AVATAR[h % TONOS_AVATAR.length];
}

export function avatarGradient(key: string | null | undefined): string {
  const s = key || "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}
