import { useState } from "react";
import { ConversationWithDetails, ChatMessage, UserProfile } from "./types";
import { ReactionGroup } from "@/hooks/useReactions";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import ChatHeader from "./components/ChatHeader";
import MessageList from "./components/MessageList";
import MessageInput from "./components/MessageInput";

interface ChatViewProps {
  conversation: ConversationWithDetails;
  messages: ChatMessage[];
  profiles: Record<string, UserProfile>;
  typingUsers: string[];
  onSendMessage: (content: string, type?: ChatMessage["type"], fileUrl?: string, fileName?: string, replyToId?: string) => void;
  onSendTyping: (isTyping: boolean) => void;
  onEditMessage: (id: string, content: string) => void;
  onDeleteMessage: (id: string) => void;
  onBack: () => void;
  onStartVideoCall: (conv: ConversationWithDetails) => void;
  loading: boolean;
  getReactionsForMessage: (messageId: string) => ReactionGroup[];
  onToggleReaction: (messageId: string, emoji: string) => void;
  getReadByUsers: (messageId: string) => string[];
}

export default function ChatView({
  conversation, messages, profiles, typingUsers, onSendMessage, onSendTyping,
  onEditMessage, onDeleteMessage, onBack, onStartVideoCall, loading,
  getReactionsForMessage, onToggleReaction, getReadByUsers,
}: ChatViewProps) {
  const { user } = useAuth();
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="flex flex-col h-full bg-background">
      <ChatHeader
        conversation={conversation}
        profiles={profiles}
        typingUsers={typingUsers}
        searchOpen={searchOpen}
        searchQuery={searchQuery}
        onSearchToggle={() => { setSearchOpen(!searchOpen); setSearchQuery(""); }}
        onSearchChange={setSearchQuery}
        onBack={onBack}
        onStartVideoCall={onStartVideoCall}
      />

      <MessageList
        messages={messages}
        profiles={profiles}
        chatType={conversation.type}
        currentUserId={user?.id}
        searchQuery={searchQuery}
        loading={loading}
        onReply={setReplyTo}
        onCopy={(content) => { navigator.clipboard.writeText(content); toast.success("Copiado"); }}
        onEdit={onEditMessage}
        onDelete={onDeleteMessage}
        getReactionsForMessage={getReactionsForMessage}
        onToggleReaction={onToggleReaction}
        getReadByUsers={getReadByUsers}
        totalParticipants={conversation.participants.length}
      />

      <MessageInput
        onSendMessage={onSendMessage}
        onSendTyping={onSendTyping}
        replyTo={replyTo}
        profiles={profiles}
        onCancelReply={() => setReplyTo(null)}
      />
    </div>
  );
}
