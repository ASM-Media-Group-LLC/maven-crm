interface Props {
  className?: string;
}

// Logo de OnlyFans (glifo "of": anillo + travesaño + llama), recreado como SVG — mismo
// criterio que WhatsAppIcon / TelegramIcon / InstagramIcon del proyecto (recreación del
// glifo de marca para uso como indicativo/link). Usa currentColor, así que se tiñe con la
// clase (ej. text-[#00AFF0] para el azul de OnlyFans).
const OnlyFansIcon = ({ className = "h-4 w-4" }: Props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    {/* "o" — anillo hueco */}
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M9 4.2A7.8 7.8 0 1 0 9 19.8 7.8 7.8 0 0 0 9 4.2Zm0 4.2A3.6 3.6 0 1 1 9 15.6 3.6 3.6 0 0 1 9 8.4Z"
    />
    {/* "f" — travesaño */}
    <path d="M12.6 9.7h4.1v1.9h-4.1z" />
    {/* "f" — tallo + llama hacia arriba-derecha */}
    <path d="M21.5 4c.4 0 .6.4.5.75-1.15 4.05-3.4 6.6-6.8 7.65v5.05c0 .7-.55 1.25-1.25 1.25s-1.25-.55-1.25-1.25V10.2c0-.6.42-1.1 1-1.2 2.9-.5 5.05-2.05 6.4-4.6.12-.24.36-.4.65-.4z" />
  </svg>
);

export default OnlyFansIcon;
