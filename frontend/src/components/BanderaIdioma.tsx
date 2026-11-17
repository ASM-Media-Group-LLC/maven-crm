import { useId } from "react";
import type { Idioma } from "@/lib/idiomas";

// LA BANDERITA DE CADA IDIOMA (Alvaro, 17/11/2026: «que quede más estético
// esta parte del idioma, quizás la banderita»).
//
// Dibujadas en SVG, redondas, y no con emoji: en Windows los emoji de bandera
// salen como dos letras («ES») y no como bandera.
//   en → Estados Unidos (en-US) · es → España · pt → Brasil (pt-BR)

function Dibujo({ idioma }: { idioma: Idioma }) {
  switch (idioma) {
    case "en":
      return (
        <>
          <rect width="20" height="20" fill="#fff" />
          {[0, 2, 4, 6, 8, 10, 12].map((i) => (
            <rect key={i} y={(i * 20) / 13} width="20" height={20 / 13} fill="#b22234" />
          ))}
          <rect width="10" height={(20 / 13) * 7} fill="#3c3b6e" />
          {[
            [2, 2], [5, 2], [8, 2],
            [3.5, 4.6], [6.5, 4.6],
            [2, 7.2], [5, 7.2], [8, 7.2],
            [3.5, 9.6], [6.5, 9.6],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r=".55" fill="#fff" />
          ))}
        </>
      );
    case "es":
      return (
        <>
          <rect width="20" height="20" fill="#c60b1e" />
          <rect y="5" width="20" height="10" fill="#ffc400" />
        </>
      );
    case "de":
      return (
        <>
          <rect width="20" height="7" fill="#000" />
          <rect y="6.67" width="20" height="6.67" fill="#dd0000" />
          <rect y="13.33" width="20" height="6.67" fill="#ffce00" />
        </>
      );
    case "fr":
      return (
        <>
          <rect width="7" height="20" fill="#002395" />
          <rect x="6.67" width="6.67" height="20" fill="#fff" />
          <rect x="13.33" width="6.67" height="20" fill="#ed2939" />
        </>
      );
    case "it":
      return (
        <>
          <rect width="7" height="20" fill="#009246" />
          <rect x="6.67" width="6.67" height="20" fill="#fff" />
          <rect x="13.33" width="6.67" height="20" fill="#ce2b37" />
        </>
      );
    case "pt":
      return (
        <>
          <rect width="20" height="20" fill="#009c3b" />
          <path d="M10 3.2 18.2 10 10 16.8 1.8 10Z" fill="#ffdf00" />
          <circle cx="10" cy="10" r="3.9" fill="#002776" />
          <path d="M6.3 9.1q3.9-1 7.5 1.2" stroke="#fff" strokeWidth=".7" fill="none" />
        </>
      );
  }
}

/** Bandera redonda del idioma (decorativa: el nombre del idioma va al lado). */
export function BanderaIdioma({ idioma, className }: { idioma: Idioma; className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <clipPath id={id}>
        <circle cx="10" cy="10" r="10" />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <Dibujo idioma={idioma} />
      </g>
      <circle cx="10" cy="10" r="9.6" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth=".8" />
    </svg>
  );
}
