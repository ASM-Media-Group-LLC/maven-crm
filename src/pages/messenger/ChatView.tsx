import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { ConversationWithDetails, ChatMessage, UserProfile } from "./types";
import { ReactionGroup } from "@/hooks/useReactions";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import ChatHeader from "./components/ChatHeader";
import MessageList from "./components/MessageList";
import MessageInput from "./components/MessageInput";
import ThreadPanel from "./components/ThreadPanel";
import SearchResultsBar from "./components/SearchResultsBar";
import NotificationSettings from "./components/NotificationSettings";
import SharedFilesGallery from "./components/SharedFilesGallery";
import GroupMembersPanel from "./components/GroupMembersPanel";

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
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onMembersChanged?: () => void;
}

export default function ChatView({
  conversation, messages, profiles, typingUsers, onSendMessage, onSendTyping,
  onEditMessage, onDeleteMessage, onBack, onStartVideoCall, loading,
  getReactionsForMessage, onToggleReaction, getReadByUsers,
  hasMore, loadingMore, onLoadMore, onMembersChanged,
}: ChatViewProps) {
  const { user } = useAuth();
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [threadParent, setThreadParent] = useState<ChatMessage | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [showSharedFiles, setShowSharedFiles] = useState(false);
  const [showGroupMembers, setShowGroupMembers] = useState(false);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return messages.filter(m => m.content?.toLowerCase().includes(q) && !m.is_deleted);
  }, [messages, searchQuery]);

  useEffect(() => { setSearchIndex(0); }, [searchQuery]);

  const handleSearchNavigate = useCallback((index: number) => {
    setSearchIndex(index);
    const msg = searchResults[index];
    if (msg) setHighlightedMsgId(msg.id);
  }, [searchResults]);

  const threadReplies = useMemo(() => {
    if (!threadParent) return [];
    return messages.filter(m => m.reply_to_id === threadParent.id);
  }, [threadParent, messages]);

  const handleSendThreadReply = useCallback((content: string) => {
    if (!threadParent) return;
    onSendMessage(content, "text", undefined, undefined, threadParent.id);
  }, [threadParent, onSendMessage]);

  const getThreadCount = useCallback((messageId: string) => {
    return messages.filter(m => m.reply_to_id === messageId).length;
  }, [messages]);

  const handleOpenThread = useCallback((msg: ChatMessage) => {
    if (msg.reply_to_id) {
      const parent = messages.find(m => m.id === msg.reply_to_id);
      if (parent) { setThreadParent(parent); return; }
    }
    setThreadParent(msg);
  }, [messages]);

  return (
    <div className="flex h-full bg-background relative">
      <div className="flex flex-col flex-1 min-w-0">
        <ChatHeader
          conversation={conversation}
          profiles={profiles}
          typingUsers={typingUsers}
          searchOpen={searchOpen}
          searchQuery={searchQuery}
          onSearchToggle={() => { setSearchOpen(!searchOpen); setSearchQuery(""); setHighlightedMsgId(null); }}
          onSearchChange={setSearchQuery}
          onBack={onBack}
          onStartVideoCall={onStartVideoCall}
          onOpenNotificationSettings={() => setShowNotifSettings(true)}
          onOpenSharedFiles={() => { setShowSharedFiles(true); setThreadParent(null); setShowGroupMembers(false); }}
          onOpenGroupMembers={() => { setShowGroupMembers(true); setShowSharedFiles(false); setThreadParent(null); }}
        />

        {searchOpen && searchQuery && (
          <SearchResultsBar
            results={searchResults}
            currentIndex={searchIndex}
            query={searchQuery}
            profiles={profiles}
            onNavigate={handleSearchNavigate}
            onClose={() => { setSearchOpen(false); setSearchQuery(""); setHighlightedMsgId(null); }}
          />
        )}

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
          highlightedMsgId={highlightedMsgId}
          onOpenThread={handleOpenThread}
          getThreadCount={getThreadCount}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={onLoadMore}
        />

        <MessageInput
          onSendMessage={onSendMessage}
          onSendTyping={onSendTyping}
          replyTo={replyTo}
          profiles={profiles}
          onCancelReply={() => setReplyTo(null)}
        />
      </div>

      {threadParent && !showSharedFiles && (
        <ThreadPanel
          parentMessage={threadParent}
          replies={threadReplies}
          profiles={profiles}
          currentUserId={user?.id}
          onSendReply={handleSendThreadReply}
          onClose={() => setThreadParent(null)}
        />
      )}

      {showSharedFiles && (
        <SharedFilesGallery
          conversationId={conversation.id}
          profiles={profiles}
          onClose={() => setShowSharedFiles(false)}
        />
      )}

      {showGroupMembers && conversation.type === "group" && (
        <GroupMembersPanel
          conversation={conversation}
          profiles={profiles}
          onClose={() => setShowGroupMembers(false)}
          onMembersChanged={() => { onMembersChanged?.(); }}
        />
      )}

      {showNotifSettings && (
        <div className="absolute right-4 top-16 z-50 w-72 bg-card border border-border rounded-xl shadow-lg">
          <NotificationSettings
            conversation={conversation}
            onClose={() => setShowNotifSettings(false)}
          />
        </div>
      )}
    </div>
  );
}
