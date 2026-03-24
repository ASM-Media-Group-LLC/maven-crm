import { cn } from "@/lib/utils";

const sizeClasses = {
  xs: "text-base gap-1",
  sm: "text-[1.65rem] gap-1.5",
  md: "text-4xl gap-2",
  lg: "text-7xl md:text-9xl gap-3",
} as const;

interface LogoProps {
  size?: keyof typeof sizeClasses;
  className?: string;
  collapsed?: boolean;
}

const Logo = ({ size = "lg", className, collapsed }: LogoProps) => {
  if (collapsed) {
    return (
      <h1
        className={cn(
          "font-bold tracking-tight select-none text-2xl",
          className
        )}
      >
        <span className="bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent">M</span>
      </h1>
    );
  }

  return (
    <h1
      className={cn(
        "font-bold tracking-tight select-none inline-flex items-baseline",
        sizeClasses[size],
        className
      )}
    >
      <span className="bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent">Maven</span>
      <span className="text-white/50 font-light">CRM</span>
    </h1>
  );
};

export default Logo;
