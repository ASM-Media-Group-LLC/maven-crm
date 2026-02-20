
## IA Ventas: Rediseño tipo ChatGPT con historial persistente

### Arquitectura general

La página `/aisales` pasará de ser un chat único a una interfaz de múltiples conversaciones, exactamente como ChatGPT. Se crean dos nuevas tablas en Supabase y se refactorizan los componentes relevantes.

---

### 1. Base de datos — 2 tablas nuevas

**`ai_conversations`** — Una fila por conversación:
| columna | tipo | notas |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| user_id | uuid | auth.uid() |
| title | text | "Nueva conversación" por defecto |
| created_at | timestamptz | now() |
| updated_at | timestamptz | now() |

**`ai_messages`** — Mensajes de cada conversación:
| columna | tipo | notas |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| conversation_id | uuid FK → ai_conversations.id | ON DELETE CASCADE |
| role | text | 'user' o 'assistant' |
| content | text | texto del mensaje |
| created_at | timestamptz | now() |

**RLS**: Cada usuario solo ve y gestiona sus propias conversaciones y mensajes (políticas por `user_id` y FK cascade).

---

### 2. Nuevo layout de la página `/aisales`

El `DashboardTopbar` y `DashboardSidebar` se conservan. La nueva estructura del `<main>` queda así:

```text
┌──────────────────────────────────────────────┐
│  DashboardSidebar  │  DashboardTopbar         │
├────────────────────┼─────────────────────────┤
│                    │  Header: título +        │
│  Chat Sidebar      │  botón Configuración     │
│  ─────────────     ├─────────────────────────┤
│  [+ Nuevo chat]    │                          │
│                    │  Área de mensajes        │
│  Hoy               │  (scroll)                │
│  ▶ Análisis top 5  │                          │
│  ▶ Tips de ayer    │                          │
│                    │                          │
│  Ayer              ├─────────────────────────┤
│  ▶ Comparativa     │  Input + Mic + Send      │
└────────────────────┴─────────────────────────┘
```

El **Chat Sidebar** (izquierdo, dentro del área de contenido) tiene ancho fijo `w-64`, con:
- Botón **"+ Nuevo chat"** (primary gradient, ancho completo)
- Lista agrupada por fecha (Hoy / Ayer / Esta semana / Anteriores)
- Conversación activa resaltada con `bg-muted`
- Al hacer hover aparece un icono de editar (lápiz) y uno de eliminar (papelera)
- Doble clic en el título o clic en el lápiz activa renombrado inline con un `<input>`

---

### 3. Nuevo hook `useAiConversations`

`src/hooks/useAiConversations.ts` — gestiona toda la lógica:

```typescript
// Funciones expuestas:
createConversation()       → crea en DB, setea como activa
deleteConversation(id)     → elimina en DB
renameConversation(id, title) → actualiza title en DB
loadMessages(conversationId)  → fetch de ai_messages
saveMessage(conversationId, role, content) → INSERT en ai_messages
```

Usa `@tanstack/react-query` para caché y revalidación.

---

### 4. Nuevo componente `AiChatSidebar`

`src/components/AiChatSidebar.tsx`:
- Recibe: lista de conversaciones, conversación activa, callbacks de crear/eliminar/renombrar/seleccionar
- Agrupa las conversaciones por fecha relativa usando `date-fns`
- Estado local para `editingId` (renombrado inline)
- Al eliminar: `AlertDialog` de confirmación antes de borrar

---

### 5. Refactor de `ClariAiChat`

El componente recibirá nuevas props:
```typescript
interface ClariAiChatProps {
  mode?: "full" | "panel";
  conversationId?: string;        // NUEVO
  initialMessages?: Msg[];        // NUEVO
  onMessageSaved?: () => void;    // NUEVO (para refrescar sidebar)
}
```

Cambios internos:
- Al cargar: muestra `initialMessages` en vez de solo `WELCOME`
- Después de cada respuesta completa de la IA: llama `saveMessage()` tanto para el mensaje del usuario como el de la IA
- El título de la conversación se genera automáticamente desde el primer mensaje del usuario (truncado a 40 chars)

---

### 6. Refactor de `AiSales.tsx`

La página reemplaza el header fijo + `<ClariAiChat key={resetKey}>` por el nuevo layout de dos paneles:

```tsx
<main className="flex flex-1 overflow-hidden">
  <AiChatSidebar ... />
  <div className="flex flex-1 flex-col min-w-0">
    {/* Header: título conversación + botón Configuración */}
    <ClariAiChat conversationId={activeId} initialMessages={messages} ... />
  </div>
</main>
```

El botón "Archivar chat" se elimina (reemplazado por "Eliminar" en el sidebar). El botón "Configuración" se mantiene en el header del área principal.

---

### Archivos a crear/modificar

| Archivo | Operación |
|---|---|
| Migración SQL | CREAR 2 tablas + RLS + índices |
| `src/hooks/useAiConversations.ts` | CREAR — lógica DB completa |
| `src/components/AiChatSidebar.tsx` | CREAR — sidebar de chats |
| `src/pages/AiSales.tsx` | MODIFICAR — nuevo layout 2 paneles |
| `src/components/ClariAiChat.tsx` | MODIFICAR — persistencia + props nuevas |
