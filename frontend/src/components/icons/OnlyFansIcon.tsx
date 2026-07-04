interface Props {
  className?: string;
}

// Símbolo de OnlyFans (marca tipo "lente": anillo + punto central). Usa currentColor,
// así que se tiñe con la clase (ej. text-[#00AFF0] para el azul de OnlyFans).
const OnlyFansIcon = ({ className = "h-4 w-4" }: Props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12z"
    />
    <circle cx="12" cy="12" r="2.6" />
  </svg>
);

export default OnlyFansIcon;
