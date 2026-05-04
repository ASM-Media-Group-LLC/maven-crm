import React from "react";

interface Props {
  className?: string;
}

const InstagramIcon = React.forwardRef<SVGSVGElement, Props>(
  ({ className = "h-4 w-4" }, ref) => (
    <svg ref={ref} viewBox="0 0 24 24" fill="none" className={className}>
      <defs>
        <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(25, 95%, 53%)" />
          <stop offset="50%" stopColor="hsl(340, 82%, 59%)" />
          <stop offset="100%" stopColor="hsl(271, 91%, 50%)" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5" stroke="url(#ig-grad)" strokeWidth="2" />
      <circle cx="12" cy="12" r="5" stroke="url(#ig-grad)" strokeWidth="2" />
      <circle cx="17.5" cy="6.5" r="1.5" fill="url(#ig-grad)" />
    </svg>
  )
);
InstagramIcon.displayName = "InstagramIcon";

export default InstagramIcon;
