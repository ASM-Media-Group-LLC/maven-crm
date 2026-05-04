import React from "react";

interface Props {
  className?: string;
}

const TikTokIcon = React.forwardRef<SVGSVGElement, Props>(
  ({ className = "h-4 w-4" }, ref) => (
    <svg ref={ref} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V9.4a8.16 8.16 0 0 0 4.76 1.52V7.48a4.83 4.83 0 0 1-1-.79Z" />
    </svg>
  )
);
TikTokIcon.displayName = "TikTokIcon";

export default TikTokIcon;

