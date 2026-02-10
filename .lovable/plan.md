

# Pagina /aisales - Chat AI con datos de creadoras y ganancias

## Resumen

Crear una nueva pagina `/aisales` con una interfaz de chat estilo ChatGPT donde el usuario puede hacer preguntas sobre las creadoras y sus ganancias. La AI tendra acceso a los datos de las tablas `of_gross_earnings` y `creators` para responder con informacion real.

## Arquitectura

La solucion consiste en:
1. Una **edge function** (`ai-sales-chat`) que recibe las preguntas del usuario, consulta las tablas de Supabase para obtener contexto, y llama a Lovable AI para generar la respuesta con streaming.
2. Una **pagina React** (`/aisales`) con interfaz de chat que consume la edge function via SSE streaming.

```text
Usuario escribe pregunta
        |
        v
  Frontend (SSE fetch)
        |
        v
  Edge Function "ai-sales-chat"
        |
        +---> Consulta Supabase: creators + of_gross_earnings
        |
        +---> Construye system prompt con datos reales
        |
        +---> Llama a Lovable AI Gateway (streaming)
        |
        v
  Respuesta streameada token por token al frontend
```

## Cambios

### 1. Edge Function: `supabase/functions/ai-sales-chat/index.ts`

- Recibe `{ messages }` del frontend
- Consulta `creators` (id, name, artistic_name, status, category, country, city) y `of_gross_earnings` (todas las columnas relevantes) desde Supabase usando la service role key
- Aplica la logica de "fecha efectiva" y deduplicacion (misma logica que `useEarningsData`)
- Construye un system prompt que incluye un resumen de los datos disponibles en formato JSON/tabular para que la AI pueda responder preguntas especificas
- Llama a `https://ai.gateway.lovable.dev/v1/chat/completions` con `LOVABLE_API_KEY`, modelo `google/gemini-3-flash-preview`, streaming habilitado
- Retorna el stream SSE directamente al cliente
- Maneja errores 429 (rate limit) y 402 (payment required)

### 2. `supabase/config.toml`

- Agregar configuracion para la nueva edge function `ai-sales-chat` con `verify_jwt = false` (para simplificar, ya que no hay auth implementado)

### 3. Nueva pagina: `src/pages/AiSales.tsx`

- Layout con `DashboardSidebar` y `DashboardTopbar` (mismo patron que las demas paginas)
- Area de chat principal con:
  - Lista de mensajes (usuario y asistente) con scroll automatico
  - Renderizado de markdown para respuestas del asistente (usando react-markdown, que se instalara)
  - Input de texto en la parte inferior con boton de enviar
  - Indicador de "escribiendo..." mientras la AI responde
- Estado: array de mensajes `{ role, content }`, `isLoading`
- Funcion `streamChat` que hace fetch a la edge function y procesa SSE token por token
- Mensajes del usuario alineados a la derecha, mensajes del asistente a la izquierda
- Mensaje inicial de bienvenida del asistente sugiriendo tipos de preguntas

### 4. `src/App.tsx`

- Agregar ruta `/aisales` con el componente `AiSales`

### 5. `src/components/dashboard/DashboardSidebar.tsx`

- Agregar "AI Sales" como sub-item dentro del grupo "Creator Sales" con icono `Bot` o `MessageSquare`

## Detalles tecnicos

### System Prompt de la Edge Function

El system prompt incluira:
- Instrucciones: "Eres un asistente de analisis de ventas. Tienes acceso a datos reales de creadoras y sus ganancias. Responde en espanol. Usa formato con numeros cuando sea relevante."
- Datos de creadoras en formato JSON resumido (nombre, status, categoria, etc.)
- Datos de ganancias con fecha efectiva, totales, suscripciones, mensajes, tips, fans activos, etc.
- Para evitar exceder el contexto, se enviaran los datos agregados y las ultimas entradas relevantes

### Dependencia nueva

- `react-markdown` para renderizar las respuestas con formato

### Estructura de archivos nuevos

```text
supabase/functions/ai-sales-chat/index.ts
src/pages/AiSales.tsx
```

### Archivos modificados

```text
supabase/config.toml        -- agregar funcion
src/App.tsx                  -- agregar ruta
src/components/dashboard/DashboardSidebar.tsx  -- agregar link en sidebar
```

