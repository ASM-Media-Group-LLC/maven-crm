import { Chat, Contact, Message, VideoRoom } from "./types";

export const mockContacts: Contact[] = [
  { id: "1", name: "María García", status: "online", phone: "+34 612 345 678" },
  { id: "2", name: "Carlos López", status: "online", phone: "+34 623 456 789" },
  { id: "3", name: "Ana Martínez", status: "away", lastSeen: "hace 15 min", phone: "+34 634 567 890" },
  { id: "4", name: "Pedro Sánchez", status: "offline", lastSeen: "hace 2 horas", phone: "+34 645 678 901" },
  { id: "5", name: "Laura Fernández", status: "online", phone: "+34 656 789 012" },
  { id: "6", name: "Diego Torres", status: "offline", lastSeen: "ayer", phone: "+34 667 890 123" },
  { id: "7", name: "Sofía Ruiz", status: "online", phone: "+34 678 901 234" },
  { id: "8", name: "Andrés Moreno", status: "away", lastSeen: "hace 30 min", phone: "+34 689 012 345" },
];

const now = new Date();
const ago = (mins: number) => new Date(now.getTime() - mins * 60000);

export const mockMessages: Record<string, Message[]> = {
  "chat-1": [
    { id: "m1", senderId: "1", content: "Hola! ¿Cómo va el proyecto?", timestamp: ago(120), status: "read", type: "text" },
    { id: "m2", senderId: "me", content: "Muy bien, estamos avanzando con el diseño", timestamp: ago(118), status: "read", type: "text" },
    { id: "m3", senderId: "1", content: "Perfecto! Te envío los archivos actualizados", timestamp: ago(115), status: "read", type: "text" },
    { id: "m4", senderId: "1", content: "propuesta_final_v3.pdf", timestamp: ago(114), status: "read", type: "file", fileName: "propuesta_final_v3.pdf" },
    { id: "m5", senderId: "me", content: "Gracias María! Los reviso ahora mismo 👍", timestamp: ago(60), status: "read", type: "text" },
    { id: "m6", senderId: "1", content: "¿Podemos hacer una videollamada mañana para revisar juntos?", timestamp: ago(30), status: "read", type: "text" },
    { id: "m7", senderId: "me", content: "Claro, a las 10am me viene perfecto", timestamp: ago(25), status: "delivered", type: "text" },
  ],
  "chat-2": [
    { id: "m8", senderId: "2", content: "Hey! ¿Viste los KPIs de este mes?", timestamp: ago(45), status: "read", type: "text" },
    { id: "m9", senderId: "me", content: "Sí, los números están increíbles 🚀", timestamp: ago(40), status: "read", type: "text" },
    { id: "m10", senderId: "2", content: "Deberíamos celebrar con el equipo", timestamp: ago(35), status: "read", type: "text" },
  ],
  "chat-3": [
    { id: "m11", senderId: "3", content: "Te comparto el reporte semanal", timestamp: ago(180), status: "read", type: "text" },
    { id: "m12", senderId: "3", content: "reporte_semana_8.xlsx", timestamp: ago(179), status: "read", type: "file", fileName: "reporte_semana_8.xlsx" },
  ],
  "chat-group-1": [
    { id: "m13", senderId: "5", content: "Buenos días equipo! 🌟", timestamp: ago(90), status: "read", type: "text" },
    { id: "m14", senderId: "2", content: "Buenos días!", timestamp: ago(88), status: "read", type: "text" },
    { id: "m15", senderId: "me", content: "Hola a todos!", timestamp: ago(85), status: "read", type: "text" },
    { id: "m16", senderId: "7", content: "Recordemos que hoy hay standup a las 11", timestamp: ago(60), status: "read", type: "text" },
    { id: "m17", senderId: "5", content: "¿Alguien puede compartir pantalla para la demo?", timestamp: ago(10), status: "delivered", type: "text" },
  ],
};

export const mockChats: Chat[] = [
  {
    id: "chat-1", type: "individual", name: "María García",
    participants: [mockContacts[0]],
    lastMessage: mockMessages["chat-1"]![6],
    unreadCount: 0, isPinned: true, isMuted: false,
  },
  {
    id: "chat-group-1", type: "group", name: "Equipo Desarrollo",
    participants: [mockContacts[1], mockContacts[4], mockContacts[6]],
    lastMessage: mockMessages["chat-group-1"]![4],
    unreadCount: 2, isPinned: true, isMuted: false,
  },
  {
    id: "chat-2", type: "individual", name: "Carlos López",
    participants: [mockContacts[1]],
    lastMessage: mockMessages["chat-2"]![2],
    unreadCount: 1, isPinned: false, isMuted: false,
  },
  {
    id: "chat-3", type: "individual", name: "Ana Martínez",
    participants: [mockContacts[2]],
    lastMessage: mockMessages["chat-3"]![1],
    unreadCount: 0, isPinned: false, isMuted: true,
  },
];

export const mockVideoRooms: VideoRoom[] = [
  {
    id: "room-1", name: "Standup Diario", createdBy: "me", createdAt: ago(60),
    participants: [mockContacts[0], mockContacts[1], mockContacts[4]],
    isActive: true, shareLink: `${window.location.origin}/messenger?room=room-1`,
  },
  {
    id: "room-2", name: "Revisión de Sprint", createdBy: "2", createdAt: ago(1440),
    participants: [mockContacts[1], mockContacts[2]],
    isActive: false, shareLink: `${window.location.origin}/messenger?room=room-2`,
  },
];
