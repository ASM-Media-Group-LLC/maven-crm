import { cn } from "@/lib/utils";

const sizeClasses = {
  sm: "text-2xl gap-2",
  md: "text-4xl gap-2",
  lg: "text-7xl md:text-9xl gap-3",
} as const;

interface LogoProps {
  size?: keyof typeof sizeClasses;
  className?: string;
}

const Logo = ({ size = "lg", className }: LogoProps) => {
  return (
    <h1
      className={cn(
        "font-bold tracking-tight select-none inline-flex items-baseline",
        sizeClasses[size],
        className
      )}
    >
      <span className="text-primary">Maven</span>
      <span className="text-muted-foreground font-light">CRM</span>
    </h1>
  );
};

export default Logo;
