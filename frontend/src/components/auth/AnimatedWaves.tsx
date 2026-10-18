const AnimatedWaves = () => {
  return (
    <div className="absolute inset-0 z-[1] overflow-hidden pointer-events-none">
      {/* Wave 1 - Large, slow diagonal sweep */}
      <svg
        className="absolute w-[120%] h-[120%] -left-[10%] -top-[10%]"
        viewBox="0 0 1200 800"
        preserveAspectRatio="none"
        style={{ animation: "wave-drift-1 35s ease-in-out infinite" }}
      >
        <defs>
          <linearGradient id="wave-fill-1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(210,80%,50%)" stopOpacity="0.08" />
            <stop offset="50%" stopColor="hsl(200,62%,45%)" stopOpacity="0.05" />
            <stop offset="100%" stopColor="hsl(211,100%,50%)" stopOpacity="0.1" />
          </linearGradient>
          <linearGradient id="wave-stroke-1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(210,80%,65%)" stopOpacity="0.25" />
            <stop offset="50%" stopColor="hsl(206,80%,55%)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="hsl(211,100%,60%)" stopOpacity="0.3" />
          </linearGradient>
        </defs>
        <path
          d="M-100,500 C100,350 300,200 500,300 C700,400 800,150 1000,250 C1200,350 1300,200 1400,300"
          fill="none"
          stroke="url(#wave-stroke-1)"
          strokeWidth="1.5"
        />
        <path
          d="M-100,520 C100,370 300,220 500,320 C700,420 800,170 1000,270 C1200,370 1300,220 1400,320 L1400,800 L-100,800 Z"
          fill="url(#wave-fill-1)"
          style={{ filter: "blur(1px)" }}
        />
      </svg>

      {/* Wave 2 - Medium, inverse direction */}
      <svg
        className="absolute w-[120%] h-[120%] -left-[10%] -top-[10%]"
        viewBox="0 0 1200 800"
        preserveAspectRatio="none"
        style={{ animation: "wave-drift-2 28s ease-in-out infinite" }}
      >
        <defs>
          <linearGradient id="wave-fill-2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(211,100%,50%)" stopOpacity="0.06" />
            <stop offset="100%" stopColor="hsl(210,80%,50%)" stopOpacity="0.09" />
          </linearGradient>
          <linearGradient id="wave-stroke-2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(211,100%,65%)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="hsl(210,80%,60%)" stopOpacity="0.28" />
          </linearGradient>
        </defs>
        <path
          d="M-100,300 C150,450 350,550 550,400 C750,250 900,500 1100,350 C1300,200 1350,400 1400,350"
          fill="none"
          stroke="url(#wave-stroke-2)"
          strokeWidth="1"
        />
        <path
          d="M-100,320 C150,470 350,570 550,420 C750,270 900,520 1100,370 C1300,220 1350,420 1400,370 L1400,0 L-100,0 Z"
          fill="url(#wave-fill-2)"
          style={{ filter: "blur(1px)" }}
        />
      </svg>

      {/* Wave 3 - Small, faster accent */}
      <svg
        className="absolute w-[110%] h-[110%] -left-[5%] -top-[5%]"
        viewBox="0 0 1200 800"
        preserveAspectRatio="none"
        style={{ animation: "wave-drift-3 22s ease-in-out infinite" }}
      >
        <defs>
          <linearGradient id="wave-fill-3" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="hsl(200,70%,50%)" stopOpacity="0.04" />
            <stop offset="50%" stopColor="hsl(210,80%,50%)" stopOpacity="0.07" />
            <stop offset="100%" stopColor="hsl(211,100%,50%)" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="wave-stroke-3" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="hsl(200,70%,60%)" stopOpacity="0.15" />
            <stop offset="50%" stopColor="hsl(210,80%,65%)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="hsl(211,100%,65%)" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        <path
          d="M-50,600 C200,500 400,650 600,550 C800,450 950,600 1250,500"
          fill="none"
          stroke="url(#wave-stroke-3)"
          strokeWidth="1"
        />
        <path
          d="M-50,620 C200,520 400,670 600,570 C800,470 950,620 1250,520 L1250,800 L-50,800 Z"
          fill="url(#wave-fill-3)"
          style={{ filter: "blur(2px)" }}
        />
      </svg>
    </div>
  );
};

export default AnimatedWaves;
