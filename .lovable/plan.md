

## Landing Page, Login, Registro y Proteccion de Rutas para Maven CRM

Este plan extiende el sistema actual sin romper nada existente. Se crean nuevas paginas publicas, autenticacion con Supabase Auth, y proteccion de rutas para el area interna.

---

### 1. Base de Datos - Migracion SQL

Crear las tablas `companies`, `profiles` y `user_roles` con RLS y triggers:

```sql
-- Companies table
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles (enum + table)
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'employee');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- RLS policies for companies
CREATE POLICY "Authenticated users can view companies" ON public.companies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert companies" ON public.companies
  FOR INSERT TO authenticated WITH CHECK (true);

-- RLS for user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'employee');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

### 2. Nuevos Archivos a Crear

| Archivo | Proposito |
|---------|-----------|
| `src/pages/Landing.tsx` | Landing page publica |
| `src/pages/Login.tsx` | Pagina de inicio de sesion |
| `src/pages/Register.tsx` | Pagina de registro |
| `src/components/ProtectedRoute.tsx` | Wrapper para rutas autenticadas |
| `src/hooks/useAuth.tsx` | Hook + contexto de autenticacion |

---

### 3. Landing Page (`src/pages/Landing.tsx`)

Basada en la imagen de referencia, con el mismo fondo oscuro y tokens del sistema:

- **Navbar**: Logo (componente `Logo` existente, size "sm"), enlaces internos (Funcionalidades), boton "Iniciar Sesion" (outline) y "Registrarse" (primary)
- **Hero**: Badge "Plataforma completa para agencias de creadores", Logo grande (size "lg"), subtitulo, CTAs "Crear cuenta" y "Iniciar sesion"
- **Modulos Grid**: 6 cards (3x2) con icono coloreado, titulo, descripcion y metrica. Cards con `bg-card border border-border` 
- **Metricas**: Seccion con 4 stats (215+, 2.3K+, 24/7, Crecimiento) en fila
- **Footer**: Logo + tagline

Colores de iconos de modulos usando tokens: `bg-accent`, `bg-primary`, `bg-success`, `bg-warning`, `bg-destructive`, `bg-primary`

---

### 4. Login (`src/pages/Login.tsx`)

- Fondo oscuro (hereda del tema dark)
- Card centrada con `max-w-md`
- Campos: Email, Contrasena (con validacion zod)
- Boton primario "Iniciar Sesion"
- Links a Registro y Recuperar contrasena
- Usa `supabase.auth.signInWithPassword()`
- Redirige a `/dashboard` al autenticar
- Toast de error si falla

---

### 5. Registro (`src/pages/Register.tsx`)

- Misma estetica que Login
- Campos: Nombre completo, Email, Contrasena, Confirmar contrasena, Empresa (opcional)
- Validacion con zod (contrasenas coinciden, email valido, min 6 caracteres)
- Usa `supabase.auth.signUp()` con `data: { full_name }`
- Si se proporciona empresa, crea registro en `companies` y actualiza `profiles.company_id`
- Redirige a `/dashboard`
- `emailRedirectTo: window.location.origin`

---

### 6. Auth Hook (`src/hooks/useAuth.tsx`)

Contexto React con:
- `user`: usuario actual de Supabase
- `session`: sesion activa
- `loading`: estado de carga
- `signOut()`: funcion de cierre de sesion

Implementa `onAuthStateChange` listener (configurado ANTES de `getSession()`) segun las mejores practicas de Supabase.

---

### 7. Protected Route (`src/components/ProtectedRoute.tsx`)

- Envuelve children
- Si `loading` muestra spinner
- Si no hay `user`, redirige a `/login`
- Si hay `user`, renderiza children

---

### 8. Cambios en Archivos Existentes

**`src/App.tsx`**:
- Envolver todo en `AuthProvider`
- Ruta `/` apunta a `Landing` (publica)
- Ruta `/login` y `/register` (publicas, redirigen a `/dashboard` si ya autenticado)
- Todas las demas rutas envueltas en `<ProtectedRoute>`
- La pagina Index actual se elimina (Landing la reemplaza)

**`src/components/dashboard/DashboardTopbar.tsx`**:
- Agregar boton de logout que llame a `signOut()`

---

### 9. Flujo de Navegacion

```text
Usuario no autenticado:
  / (Landing) --> /login o /register
  /dashboard --> redirige a /login
  
Usuario autenticado:
  / (Landing) --> puede acceder normalmente
  /login --> redirige a /dashboard
  /register --> redirige a /dashboard
  /dashboard --> acceso normal
```

---

### 10. Tokens del Sistema de Diseno

Todos los elementos nuevos usaran exclusivamente:
- Fondos: `bg-background`, `bg-card`, `bg-muted`
- Textos: `text-foreground`, `text-muted-foreground`
- Bordes: `border-border`
- Botones: variantes existentes de shadcn (default, outline, ghost)
- Gradientes: Solo el gradiente de marca existente (`from-accent to-primary`)
- Sin colores hardcoded, sin sombras para hover

