export interface Contact {
  id: string;
  name: string;
  avatar?: string;
  status: "online" | "offline" | "away";
  lastSeen?: string;
  phone?: string;
}

export interface Message {
  id: string;
  senderId: string;
  content: string;
  timestamp: Date;
  status: "sent" | "delivered" | "read";
  type: "text" | "image" | "file" | "audio" | "video";
  fileUrl?: string;
  fileName?: string;
  replyTo?: string;
}

export interface Chat {
  id: string;
  type: "individual" | "group";
  name: string;
  avatar?: string;
  participants: Contact[];
  lastMessage?: Message;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
}

export interface VideoRoom {
  id: string;
  name: string;
  createdBy: string;
  createdAt: Date;
  participants: Contact[];
  isActive: boolean;
  shareLink: string;
}
