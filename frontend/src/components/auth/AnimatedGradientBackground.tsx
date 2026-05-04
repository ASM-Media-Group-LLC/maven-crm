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
      {/* Blob 2 - Blue/Primary */}
      <div
        className="absolute rounded-full"
        style={{
          width: "75%",
          height: "75%",
          bottom: "-25%",
          right: "-20%",
          background: "hsl(271, 91%, 50%)",
          filter: "blur(130px)",
          opacity: 0.3,
          animation: "blob-move-2 25s ease-in-out infinite",
        }}
      />
      {/* Blob 3 - Purple/Accent */}
      <div
        className="absolute rounded-full"
        style={{
          width: "60%",
          height: "60%",
          top: "20%",
          left: "30%",
          background: "hsl(220, 80%, 40%)",
          filter: "blur(100px)",
          opacity: 0.2,
          animation: "blob-move-3 18s ease-in-out infinite",
        }}
      />
      {/* Blob 4 - Pink */}
      <div
        className="absolute rounded-full"
        style={{
          width: "55%",
          height: "55%",
          bottom: "10%",
          left: "-10%",
          background: "hsl(260, 70%, 35%)",
          filter: "blur(110px)",
          opacity: 0.25,
          animation: "blob-move-4 22s ease-in-out infinite",
        }}
      />
      {/* Blob 5 - Warm accent for extra dynamics */}
      <div
        className="absolute rounded-full"
        style={{
          width: "50%",
          height: "50%",
          top: "-10%",
          right: "10%",
          background: "hsl(240, 60%, 45%)",
          filter: "blur(140px)",
          opacity: 0.15,
          animation: "blob-move-5 24s ease-in-out infinite",
        }}
      />
    </div>
  );
};

export default AnimatedGradientBackground;
