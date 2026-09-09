import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Shield, Users, Briefcase, UserCheck, Phone, Eye, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import AnimatedGradientBackground from "@/components/auth/AnimatedGradientBackground";
import AnimatedWaves from "@/components/auth/AnimatedWaves";

// SEGURIDAD: nunca hardcodear la contraseña (terminaba shippeada en el bundle).
// Viene de una env var SOLO de desarrollo; en prod queda vacía (y la página ni
// se rutea — ver App.tsx). Para usar esta página en dev: setear VITE_TEST_PASSWORD.
const TEST_PASSWORD = import.meta.env.VITE_TEST_PASSWORD ?? "";

const roles = [
  {
    name: "Admin",
    description: "Acceso total a todos los módulos del sistema",
    email: "test-admin@maven.app",
    icon: Shield,
    gradient: "from-red-500/20 to-orange-500/20",
    border: "border-red-500/30",
    iconColor: "text-red-400",
  },
  {
    name: "Manager",
    description: "Gestión de creadores, ventas, HR y equipo",
    email: "test-manager@maven.app",
    icon: Briefcase,
    gradient: "from-blue-500/20 to-cyan-500/20",
    border: "border-blue-500/30",
    iconColor: "text-blue-400",
  },
  {
    name: "Supervisor",
    description: "Supervisión de creadores, ventas y HR",
    email: "test-supervisor@maven.app",
    icon: Eye,
    gradient: "from-purple-500/20 to-pink-500/20",
    border: "border-purple-500/30",
    iconColor: "text-purple-400",
  },
  {
    name: "Agent",
    description: "Insights, tareas y messenger",
    email: "test-agent@maven.app",
    icon: UserCheck,
    gradient: "from-green-500/20 to-emerald-500/20",
    border: "border-green-500/30",
    iconColor: "text-green-400",
  },
  {
    name: "Closer",
    description: "Closers, ventas, contactos y LeadGen",
    email: "test-closer@maven.app",
    icon: Phone,
    gradient: "from-amber-500/20 to-yellow-500/20",
    border: "border-amber-500/30",
    iconColor: "text-amber-400",
  },
  {
    name: "Employee",
    description: "Dashboard, tareas y messenger",
    email: "test-employee@maven.app",
    icon: Users,
    gradient: "from-slate-500/20 to-zinc-500/20",
    border: "border-slate-500/30",
    iconColor: "text-slate-400",
  },
];

const Credentials = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loadingRole, setLoadingRole] = useState<string | null>(null);

  const handleLogin = async (email: string, roleName: string) => {
    setLoadingRole(roleName);

    // Sign out first if already logged in
    if (user) {
      await supabase.auth.signOut();
      // Small delay for state to clear
      await new Promise((r) => setTimeout(r, 300));
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: TEST_PASSWORD,
    });

    setLoadingRole(null);

    if (error) {
      toast({
        title: "Error al acceder",
        description: `No se pudo iniciar sesión como ${roleName}. Verifica que la cuenta de prueba exista.`,
        variant: "destructive",
      });
    } else {
      toast({ title: `Sesión iniciada como ${roleName}` });
      navigate("/dashboard");
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[hsl(240,10%,2%)]">
      <AnimatedGradientBackground />
      <AnimatedWaves />
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-12">
        <Logo size="md" />
        <p className="text-white/60 mt-2 mb-2 text-sm font-light tracking-wide text-center max-w-md">
          Cuentas de prueba para acceso rápido
        </p>

        {user && (
          <Button
            variant="ghost"
            size="sm"
            className="mb-6 text-white/50 hover:text-white"
            onClick={() => signOut()}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar sesión actual
          </Button>
        )}

        <div className="w-full max-w-4xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {roles.map((role) => {
            const Icon = role.icon;
            const isLoading = loadingRole === role.name;
            return (
              <button
                key={role.name}
                onClick={() => handleLogin(role.email, role.name)}
                disabled={!!loadingRole}
                className={`group relative backdrop-blur-2xl bg-gradient-to-br ${role.gradient} border ${role.border} rounded-2xl p-6 text-left transition-all duration-300 hover:shadow-[0_0_40px_-10px_hsl(271,91%,50%,0.2)] disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl bg-white/5 ${role.iconColor}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white">{role.name}</h3>
                    <p className="text-xs text-white/50 mt-1 leading-relaxed">
                      {role.description}
                    </p>
                    <p className="text-[10px] text-white/30 mt-2 font-mono truncate">
                      {role.email}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-end">
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white/60" />
                  ) : (
                    <span className="text-xs text-white/40 group-hover:text-white/70 transition-colors">
                      Acceder →
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-white/20 text-[10px] mt-8 text-center">
          Estas cuentas son exclusivamente para testing y desarrollo.
        </p>
      </div>
    </div>
  );
};

export default Credentials;
