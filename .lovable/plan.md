
# Reemplazar modal "Agregar Creador" por pagina completa

## Resumen
Cambiar el flujo de "Agregar Creador" de un modal a una pagina completa en `/creadores/nuevo`, con formulario organizado en secciones segun las imagenes de referencia. La pagina incluira el sidebar y topbar existentes, con un header "Volver a Creadores" y el formulario dividido en cards por seccion.

## Cambios

### 1. Nueva ruta `/creadores/nuevo` en `src/App.tsx`
- Agregar ruta `<Route path="/creadores/nuevo" element={<NuevoCreador />} />`
- Importar el nuevo componente de pagina

### 2. Nueva pagina `src/pages/NuevoCreador.tsx`
- Wrapper con `SidebarProvider`, `DashboardSidebar`, `DashboardTopbar` (misma estructura que `Creadores.tsx`)
- Renderiza el componente de formulario `NuevoCreadorForm`

### 3. Nuevo componente `src/pages/creadores/NuevoCreadorForm.tsx` -- Formulario completo
Pagina scrollable con las siguientes secciones en cards separadas:

**Header:**
- Flecha izquierda + "Volver a Creadores" (link a `/creadores`)
- Boton "Llenar datos de prueba" a la derecha (outline, con icono lapiz)
- Titulo: icono Users + "Nuevo Creador"
- Subtitulo: "Completa los detalles del nuevo creador"

**Seccion 1 - Informacion Basica** (card con borde)
- Agencia Asignada * (Select: opciones de agencias existentes)
- Estado (Select: En onboarding por defecto)
- Nombre Completo * (Input)
- Nombre Artistico (Input)
- Edad * (Input number, default 18)
- Fecha de Nacimiento * (Input date)
- Pais * (Select con paises)
- Ciudad * (Select, depende del pais seleccionado o input libre)
- Idiomas * (Checkboxes: Espanol, English, Italiano, Portugues, Francais, Deutsch, Russkiy)

**Seccion 2 - Informacion de Contacto** (card)
- Email (Input)
- Telefono (Input, placeholder +573001234567)

**Seccion 3 - Redes Sociales** (card)
- Instagram URL (Input, placeholder https://instagram.com/username)
- Twitter/X URL (Input, placeholder https://x.com/username)
- TikTok URL (Input, placeholder https://tiktok.com/@username)
- YouTube URL (Input, placeholder https://youtube.com/@channel)
- LinkedIn URL (Input, placeholder https://linkedin.com/in/...)
- OnlyFans URL (Input)

**Seccion 4 - Perfil y Biografia** (card)
- URL de Foto de Perfil (Input, full width)
- Biografia (Textarea)

**Seccion 5 - Operacion & Categorizacion** (card)
- Categoria de Modelo (Select: A+, A, B+, B, C)
- Fecha de Inicio Oficial (Input date)

**Seccion 6 - Documentacion** (card)
- Contrato Firmado & Documentos: texto informativo + boton "Subir Archivos" (deshabilitado por ahora, requiere storage)
- Tiene PickLink Confirmado? (Checkbox)

**Seccion 7 - Condiciones Comerciales** (card)
- Porcentaje Agencia (%) (Input number, default 15)
- Metodo de Pago (Select: Transferencia, PayPal, Crypto, Otro)
- Blue Package (Checkbox: Tiene paquete Blue?)

**Seccion 8 - Captura y Monetizacion** (card)
- Capturas de Monetizacion: texto informativo
- Fotos y Videos Extras: boton "Subir Archivos" (deshabilitado)
- Plataforma Principal (Select: OnlyFans, Fansly, Otra)
- Plataforma Secundaria (Select: mismas opciones)
- Usuario/Nombre de Cuenta en Plataforma (Input, placeholder @username)

**Seccion 9 - Notas Internas** (card)
- Notas Internas (Textarea grande, placeholder "Observaciones del equipo, comentarios del closer, etc...")

**Footer fijo:**
- Boton "Cancelar" (navega a /creadores)
- Boton "Guardar" con icono disco (primario, submit)

### 4. Actualizar `src/pages/creadores/CreadoresContent.tsx`
- Cambiar el boton "Agregar Creador" para que use `useNavigate` a `/creadores/nuevo` en lugar de abrir modal
- Eliminar el estado `modalOpen` y el componente `AddCreadorModal`

### 5. Actualizar `src/pages/creadores/useCreadores.ts`
- Agregar mutation `useAddCreadorWithBusiness` que inserta en `creators` y luego en `creator_business` con los campos adicionales (agency_percentage, payment_method, blue_package, has_piclink, main_platform, secondary_platform, platform_username, start_date)

### 6. Boton "Llenar datos de prueba"
- Al hacer click, llena todos los campos del formulario con datos ficticios realistas para testing rapido

## Detalle Tecnico

**Campos del formulario mapeados a tablas:**

Tabla `creators`:
- name, artistic_name, email, phone, category, country, country_code, city, status
- age, birth_date, languages
- instagram_handle, twitter_handle, tiktok_handle, youtube_handle, linkedin_handle, onlyfans_url
- profile_photo_url, bio, internal_notes

Tabla `creator_business` (insert despues del creator):
- creator_id (del insert anterior)
- assigned_agency, agency_percentage, payment_method, blue_package, has_piclink
- main_platform, secondary_platform, platform_username, start_date

**Estructura de seccion:**
```tsx
<div className="rounded-lg border bg-card p-6 space-y-4">
  <h3 className="text-lg font-semibold flex items-center gap-2">
    <span>icono</span> Titulo Seccion
  </h3>
  <div className="grid grid-cols-2 gap-4">
    {/* campos */}
  </div>
</div>
```

**Navegacion con react-router-dom:**
```tsx
const navigate = useNavigate();
// Cancelar -> navigate("/creadores")
// Submit exitoso -> navigate("/creadores")
```

## Archivos modificados
- `src/App.tsx` (nueva ruta)
- `src/pages/NuevoCreador.tsx` (nuevo)
- `src/pages/creadores/NuevoCreadorForm.tsx` (nuevo)
- `src/pages/creadores/CreadoresContent.tsx` (cambiar boton a navigate)
- `src/pages/creadores/useCreadores.ts` (nueva mutation con creator_business)
