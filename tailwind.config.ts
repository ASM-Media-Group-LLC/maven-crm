import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

export default {
  darkMode: ["class"],
  content: ["./frontend/index.html", "./frontend/src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        // Colores de canal: solo marcan canal (icono, chip, burbuja de Telegram).
        // Nunca significan estado; para eso están success/warning/destructive.
        whatsapp: "hsl(var(--whatsapp))",
        telegram: "hsl(var(--telegram))",
        "instagram-pink": "hsl(var(--instagram-pink))",
        "instagram-purple": "hsl(var(--instagram-purple))",
        "instagram-orange": "hsl(var(--instagram-orange))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Los tres radios del sistema (rediseño 09/2026): se declaran por rol,
        // no por tamaño. `rounded-full` sigue para chips y avatares. La escala
        // sm/md/lg/xl/2xl/3xl queda en retirada: ver /design-system → Radios.
        control: "0.5rem",
        panel: "0.75rem",
        card: "1rem",
      },
      fontFamily: {
        // Fuente display del reskin — solo títulos/números grandes vía
        // `font-display`; el stack por defecto (body) no se toca.
        display: ["Sora", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "clari-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 hsl(var(--primary) / 0.4)" },
          "50%": { boxShadow: "0 0 0 10px hsl(var(--primary) / 0)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
        "presence-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 hsl(var(--success) / 0.4)" },
          "50%": { boxShadow: "0 0 0 4px hsl(var(--success) / 0)" },
        },
        "reaction-float": {
          "0%": { opacity: "0", transform: "translateY(30px) scale(0.5)" },
          "15%": { opacity: "1", transform: "translateY(-10px) scale(1.15)" },
          "30%": { opacity: "1", transform: "translateY(-20px) scale(1)" },
          "70%": { opacity: "1", transform: "translateY(-40px) scale(1)" },
          "100%": { opacity: "0", transform: "translateY(-60px) scale(0.8)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "clari-pulse": "clari-pulse 2s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.6s ease-out both",
        "float": "float 3s ease-in-out infinite",
        "presence-pulse": "presence-pulse 2.5s ease-in-out infinite",
        "reaction-float": "reaction-float 5s ease-out forwards",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    // `tactil:` — el dispositivo se maneja con un DEDO, no con un mouse.
    //
    // Existe porque agrandar los botones por ANCHO de pantalla no funciona: un
    // telefono acostado mide mas de 640px, asi que con `sm:` volvia a los
    // tamaños de escritorio justo cuando la persona lo estaba usando con el
    // pulgar. Y al reves, una ventana de escritorio angosta se llenaba de
    // botones gigantes que nadie necesitaba.
    //
    // Se usa al reves de un breakpoint: la clase SIN prefijo es el valor de
    // escritorio, y `tactil:` la agranda. Asi el default es el de siempre.
    //
    //   <Button className="h-6 w-6 tactil:h-9 tactil:w-9" />
    //
    // Una laptop con pantalla tactil NO entra: `pointer: coarse` mira el
    // puntero PRIMARIO, y ahi sigue siendo el mouse.
    plugin(({ addVariant }) => {
      addVariant("tactil", "@media (pointer: coarse)");
    }),
  ],
} satisfies Config;
