const AnimatedGradientBackground = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Blob 1 - Red/Destructive */}
      <div
        className="absolute rounded-full"
        style={{
          width: "70%",
          height: "70%",
          top: "-20%",
          left: "-15%",
          background: "hsl(211, 100%, 50%)",
          filter: "blur(120px)",
          opacity: 0.25,
          animation: "blob-move-1 20s ease-in-out infinite",
        }}
      />
      {/* Blob 2 - Acero (primary) */}
      <div
        className="absolute rounded-full"
        style={{
          width: "75%",
          height: "75%",
          bottom: "-25%",
          right: "-20%",
          background: "hsl(var(--primary))",
          filter: "blur(130px)",
          opacity: 0.3,
          animation: "blob-move-2 25s ease-in-out infinite",
        }}
      />
      {/* Blob 3 - azul acero profundo */}
      <div
        className="absolute rounded-full"
        style={{
          width: "60%",
          height: "60%",
          top: "20%",
          left: "30%",
          background: "hsl(208, 80%, 42%)",
          filter: "blur(100px)",
          opacity: 0.2,
          animation: "blob-move-3 18s ease-in-out infinite",
        }}
      />
      {/* Blob 4 - cian acero (accent) */}
      <div
        className="absolute rounded-full"
        style={{
          width: "55%",
          height: "55%",
          bottom: "10%",
          left: "-10%",
          background: "hsl(var(--accent))",
          filter: "blur(110px)",
          opacity: 0.25,
          animation: "blob-move-4 22s ease-in-out infinite",
        }}
      />
      {/* Blob 5 - cian para dar aire */}
      <div
        className="absolute rounded-full"
        style={{
          width: "50%",
          height: "50%",
          top: "-10%",
          right: "10%",
          background: "hsl(200, 62%, 46%)",
          filter: "blur(140px)",
          opacity: 0.15,
          animation: "blob-move-5 24s ease-in-out infinite",
        }}
      />
    </div>
  );
};

export default AnimatedGradientBackground;
