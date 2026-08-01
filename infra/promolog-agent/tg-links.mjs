// tg-links.mjs — el ÚNICO lugar que decide qué es un handle de Telegram.
//
// Antes cada scraper lo adivinaba con su propio regex, y los formatos raros que
// hay en la DB se caían por el medio: un handle que no matcheaba "público" ni
// "invite" no entraba en ninguna de las dos listas y desaparecía —  ni se leía ni
// salía en el informe como no leído. Invisible, que es la peor forma de fallar.
//
// Formatos reales que vienen de creators.telegram_handle (los vi en los 37 targets):
//   https://t.me/marcyjimn                    → público
//   marcyjimn / @marcyjimn                    → público (pelado)
//   https://t.me/lapameli?fbclid=PAZXh0…      → público + basura de tracking
//   https://t.me/+W6nEK22zoT4wNGYx            → invite
//   +bUOWC9_JI0MxZjFh                         → invite (hash pelado, SIN t.me)
//   https://t.me/joinchat/DuumS8XfMiVjMzdh    → invite (formato viejo)
//   https://t.me/+7I1YGD-AyyY1OTEx?fbclid=…   → invite + tracking
//   https://t.me/m/860efoneOTgx               → NO es un canal (link de chat) → unknown

const WEB = "https://web.telegram.org/k/";

/** Deep link que ABRE algo en el web app (y no en la landing de t.me).
 *  Ojo: t.me/+hash NO sirve para unirse — es la página pública "Open in Telegram",
 *  no tiene UI de join. El web app sí la tiene, y entra por ?tgaddr=. */
const tgaddr = (uri) => `${WEB}#?tgaddr=${encodeURIComponent(uri)}`;

export function parseHandle(raw) {
  const original = String(raw ?? "").trim();
  let s = original
    .replace(/^https?:\/\//i, "")
    .replace(/^(?:www\.)?(?:t\.me|telegram\.me)\//i, "")
    .replace(/^@/, "")
    .replace(/[?#].*$/, "");                       // ?fbclid=… y demás tracking

  if (!s) return { kind: "unknown", raw: original, reason: "handle vacío" };

  const inv = s.match(/^\+([A-Za-z0-9_-]+)$/) || s.match(/^joinchat\/([A-Za-z0-9_-]+)$/i);
  if (inv) {
    const hash = inv[1];
    return {
      kind: "invite", hash, raw: original,
      label: `+${hash.slice(0, 8)}…`,
      publicUrl: `https://t.me/+${hash}`,
      // tg://join?invite=<hash> es lo que el web app entiende como "unirme a esto".
      openUrl: tgaddr(`tg://join?invite=${hash}`),
    };
  }

  // Usuario: 4–32 alfanuméricos. Acepta el prefijo s/ (vista pública) y un
  // /123 final (permalink a un post) sin confundirlo con otra cosa.
  const pub = s.match(/^(?:s\/)?([A-Za-z0-9_]{4,32})(?:\/\d+)?$/);
  if (pub) {
    const username = pub[1];
    return {
      kind: "public", username, raw: original,
      label: `@${username}`,
      publicUrl: `https://t.me/${username}`,
      previewUrl: `https://t.me/s/${username}`,
      openUrl: tgaddr(`tg://resolve?domain=${username}`),
    };
  }

  return { kind: "unknown", raw: original, label: original.slice(0, 40), reason: `formato no reconocido (${s.slice(0, 40)})` };
}

export const isInvite = (h) => parseHandle(h).kind === "invite";
export const publicUser = (h) => { const p = parseHandle(h); return p.kind === "public" ? p.username : null; };
