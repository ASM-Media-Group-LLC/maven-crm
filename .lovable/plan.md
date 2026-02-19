
## Tres cambios en IA Ventas

### 1. Sidebar — quitar el engranaje de "IA Ventas"

`src/components/dashboard/DashboardSidebar.tsx`:
- Quitar el renderizado especial de "IA Ventas" con el botón de Settings.
- Devolver "IA Ventas" a un `SidebarMenuSubItem` estándar (como Dashboard y Reportes).
- Quitar "Config IA" del dropdown del estado colapsado.

Resultado del submenú Ventas:
```text
Ventas ▾
  ├─ Dashboard   → /sales-overview
  ├─ Reportes    → /salesdashboard
  └─ IA Ventas   → /aisales
```

---

### 2. Página IA Ventas — header con acciones

`src/pages/AiSales.tsx`: añadir un header sticky con tres acciones a la derecha:

| Botón | Ícono | Acción |
|---|---|---|
| Configuración | `Settings` | Navega a `/ai-sales-config` |
| Archivar chat | `Archive` | Limpia el historial de mensajes |

Para archivar: se usa un `resetKey` (estado numérico) como `key` del componente `ClariAiChat`. Al incrementarlo, React desmonta y vuelve a montar el componente, restableciendo todo el estado de mensajes de forma limpia sin necesidad de pasar props extra.

---

### 3. Componente ClariAiChat — botón de voz (micrófono)

`src/components/ClariAiChat.tsx`:

**Tecnología**: Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`), nativa en el navegador, sin costo ni API key adicional. Compatible con Chrome, Edge y Safari.

**Comportamiento**:
- Nuevo botón de micrófono (`Mic` / `MicOff`) junto al botón de enviar.
- Al hacer clic: inicia grabación y muestra el ícono en rojo con una animación de pulso (`animate-pulse`).
- Mientras graba: el texto reconocido aparece en tiempo real en el textarea (resultados interinos).
- Al terminar de hablar: el texto final queda en el input listo para enviar (o se puede enviar automáticamente).
- Si el browser no soporta la API: el botón se oculta.

**Implementación**:
```tsx
const recognition = useRef<SpeechRecognition | null>(null);
const [isRecording, setIsRecording] = useState(false);

const toggleRecording = () => {
  if (isRecording) {
    recognition.current?.stop();
    return;
  }
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return;
  const rec = new SpeechRec();
  rec.lang = "es-ES";
  rec.continuous = false;
  rec.interimResults = true;
  rec.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join("");
    setInput(transcript);
  };
  rec.onend = () => setIsRecording(false);
  rec.start();
  setIsRecording(true);
  recognition.current = rec;
};
```

---

### Archivos a modificar

| Archivo | Cambios |
|---|---|
| `src/components/dashboard/DashboardSidebar.tsx` | Quitar gear icon y volver IA Ventas a link estándar |
| `src/pages/AiSales.tsx` | Añadir header con Settings + Archive |
| `src/components/ClariAiChat.tsx` | Añadir botón de micrófono con Web Speech API |
