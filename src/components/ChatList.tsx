import React, { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '../lib/supabase';
import type { Profile, Message } from '../App';

interface ChatListProps {
  currentUserId: string;
  onSelectUser: (user: Profile) => void;
}

export default function ChatList({ currentUserId, onSelectUser }: ChatListProps) {
  const [chats, setChats] = useState<Array<{
    user: Profile;
    lastMessage: Message | null;
    unreadCount: number;
  }>>([]);

  useEffect(() => {
    fetchChats();
    const subscription = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        () => {
          fetchChats();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [currentUserId]);

  const fetchChats = async () => {
    // Get all messages for the current user
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
      .order('created_at', { ascending: false });

    if (!messages) return;

    // Get unique user IDs from messages
    const userIds = new Set(
      messages.map((msg) =>
        msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id
      )
    );

    // Fetch user profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', Array.from(userIds));

    if (!profiles) return;

    // Organize chats
    const chatList = profiles.map((profile) => {
      const userMessages = messages.filter(
        (msg) =>
          (msg.sender_id === currentUserId && msg.receiver_id === profile.id) ||
          (msg.sender_id === profile.id && msg.receiver_id === currentUserId)
      );

      const unreadCount = userMessages.filter(
        (msg) => msg.receiver_id === currentUserId && !msg.read
      ).length;

      return {
        user: profile,
        lastMessage: userMessages[0] || null,
        unreadCount,
      };
    });

    // Sort by last message date
    chatList.sort((a, b) => {
      if (!a.lastMessage) return 1;
      if (!b.lastMessage) return -1;
      return (
        new Date(b.lastMessage.created_at).getTime() -
        new Date(a.lastMessage.created_at).getTime()
      );
    });

    setChats(chatList);
  };

  return (
    <div className="divide-y divide-gray-200">
      {chats.map(({ user, lastMessage, unreadCount }) => (
        <button
          key={user.id}
          onClick={() => onSelectUser(user)}
          className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-gray-50 focus:outline-none"
        >
          <div className="relative">
            <img
              src={user.avatar_url || 'https://via.placeholder.com/40'}
              alt={user.username}
              className="w-12 h-12 rounded-full"
            />
            {user.status === 'online' && (
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900 truncate">
                {user.username}
              </h3>
              {lastMessage && (
                <p className="text-xs text-gray-500">
                  {formatDistanceToNow(new Date(lastMessage.created_at), {
                    addSuffix: true,
                  })}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 truncate">
                {lastMessage?.content ||
                  (lastMessage?.image_url ? '📷 Image' : 'No messages yet')}
              </p>
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-blue-500 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}