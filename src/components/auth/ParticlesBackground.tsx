import { useMemo } from "react";

const ParticlesBackground = () => {
  const particles = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: i < 6 ? Math.random() * 6 + 4 : Math.random() * 2 + 1.5,
      opacity: Math.random() * 0.4 + 0.15,
      delay: `${Math.random() * 5}s`,
      duration: `${Math.random() * 4 + 3}s`,
      blur: i < 6,
    }));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-white"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            filter: p.blur ? "blur(2px)" : undefined,
            animation: `twinkle ${p.duration} ease-in-out ${p.delay} infinite, float-particle ${p.duration} ease-in-out ${p.delay} infinite`,
          }}
        />
      ))}
    </div>
  );
};

export default ParticlesBackground;
