const AnimatedGradientBackground = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Blob 1 - Red/Destructive - top left */}
      <div
        className="absolute rounded-full"
        style={{
          width: "60%",
          height: "60%",
          top: "-10%",
          left: "-10%",
          background: "hsl(0, 84%, 60%)",
          filter: "blur(100px)",
          opacity: 0.5,
          animation: "blob-move-1 12s ease-in-out infinite alternate",
        }}
      />
      {/* Blob 2 - Blue/Primary - center bottom */}
      <div
        className="absolute rounded-full"
        style={{
          width: "50%",
          height: "50%",
          bottom: "-5%",
          left: "25%",
          background: "hsl(211, 100%, 50%)",
          filter: "blur(120px)",
          opacity: 0.45,
          animation: "blob-move-2 10s ease-in-out infinite alternate",
        }}
      />
      {/* Blob 3 - Purple/Accent - center */}
      <div
        className="absolute rounded-full"
        style={{
          width: "45%",
          height: "45%",
          top: "30%",
          left: "20%",
          background: "hsl(271, 91%, 50%)",
          filter: "blur(80px)",
          opacity: 0.35,
          animation: "blob-move-3 15s ease-in-out infinite alternate",
        }}
      />
      {/* Blob 4 - Pink - transition between red and blue */}
      <div
        className="absolute rounded-full"
        style={{
          width: "40%",
          height: "40%",
          top: "50%",
          left: "5%",
          background: "hsl(340, 82%, 59%)",
          filter: "blur(100px)",
          opacity: 0.25,
          animation: "blob-move-4 8s ease-in-out infinite alternate",
        }}
      />
    </div>
  );
};

export default AnimatedGradientBackground;
