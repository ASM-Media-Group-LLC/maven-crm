

## Diagnóstico: Por qué apareces duplicado en el Host Hub

**Causa raíz**: En `CoworkHostDashboard.tsx` (líneas 29-36), `displayName` se inicializa como `"Host"` y luego se actualiza asincrónicamente al cargar el perfil:

```
const [displayName, setDisplayName] = useState("Host");  // ← valor inicial

useEffect(() => {
  supabase.auth.getUser().then(async ({ data }) => {
    // ... perfil carga y actualiza a "NombreReal"
    setDisplayName(profile?.full_name || "Host");
  });
}, []);
```

El `LiveKitCallView` del Host Hub se monta inmediatamente (porque `hubConnected` se pone en `true` al detectar `host_hub_livekit_room`). Esto causa:

1. **Mount inicial** → `LiveKitCallView` llama `lk.connect(room, "Host", ...)` → participante 1
2. **Perfil carga** → `displayName` cambia a nombre real → useEffect en `LiveKitCallView` (línea 69-73) detecta cambio en deps (`displayName`) → `disconnect()` + `connect(room, "NombreReal", ...)` → participante 2

El `disconnect()` del cliente local es instantáneo, pero el servidor LiveKit puede tardar unos segundos en limpiar la sesión anterior, causando que aparezcan **2 participantes** temporalmente (o permanentemente si el disconnect no se propaga bien).

## Plan

### 1. No renderizar el Hub hasta tener el nombre real (CoworkHostDashboard.tsx)

- Mover la carga del perfil a un estado con flag `profileLoaded`
- Condicionar el render del `LiveKitCallView` del Hub a `profileLoaded === true`
- Esto elimina la doble conexión porque `displayName` ya será estable cuando el componente se monte

### 2. Guard adicional: no reconectar por cambio de displayName (LiveKitCallView.tsx)

- Usar un `ref` para `displayName` dentro del useEffect de conexión en vez de incluirlo en las dependencias del effect
- Esto previene reconexiones innecesarias si el nombre cambia después de la conexión inicial (el nombre ya se envió al servidor al conectar)

### Archivos a modificar
- `src/pages/cowork/CoworkHostDashboard.tsx` — esperar a que cargue el perfil antes de renderizar Hub
- `src/pages/messenger/videocall/LiveKitCallView.tsx` — usar ref para displayName y removerlo de deps del connect effect

