import React, { useState, useEffect, useRef } from 'react';
import { Send, Image as ImageIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '../lib/supabase';
import type { Profile, Message } from '../App';

interface ChatWindowProps {
  currentUser: Profile;
  selectedUser: Profile;
}

export default function ChatWindow({ currentUser, selectedUser }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchMessages();

    // Create a channel for real-time updates
    const channel = supabase.channel('chat-messages');

    // Subscribe to INSERT events
    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `(sender_id=eq.${currentUser.id} AND receiver_id=eq.${selectedUser.id}) OR (sender_id=eq.${selectedUser.id} AND receiver_id=eq.${currentUser.id})`,
        },
        (payload) => {
          const newMessage = payload.new as Message;
          setMessages((currentMessages) => {
            // Check if message already exists to prevent duplicates
            const exists = currentMessages.some((msg) => msg.id === newMessage.id);
            if (exists) {
              return currentMessages;
            }
            return [...currentMessages, newMessage];
          });
        }
      )
      // Subscribe to UPDATE events
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `(sender_id=eq.${currentUser.id} AND receiver_id=eq.${selectedUser.id}) OR (sender_id=eq.${selectedUser.id} AND receiver_id=eq.${currentUser.id})`,
        },
        (payload) => {
          const updatedMessage = payload.new as Message;
          setMessages((currentMessages) =>
            currentMessages.map((msg) =>
              msg.id === updatedMessage.id ? updatedMessage : msg
            )
          );
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to chat messages');
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [currentUser.id, selectedUser.id]);

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedUser.id}),` +
        `and(sender_id.eq.${selectedUser.id},receiver_id.eq.${currentUser.id})`
      )
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
    } else {
      setMessages(data || []);
      // Mark messages as read
      const unreadMessages = data?.filter(
        (msg) => msg.receiver_id === currentUser.id && !msg.read
      );
      if (unreadMessages?.length) {
        await supabase
          .from('messages')
          .update({ read: true })
          .in(
            'id',
            unreadMessages.map((msg) => msg.id)
          );
      }
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const newMsg = {
      sender_id: currentUser.id,
      receiver_id: selectedUser.id,
      content: newMessage,
    };

    // Optimistically add the message to the UI
    const optimisticMessage: Message = {
      id: crypto.randomUUID(),
      ...newMsg,
      read: false,
      image_url: null,
      created_at: new Date().toISOString(),
    };
    setMessages((currentMessages) => [...currentMessages, optimisticMessage]);
    setNewMessage('');

    // Send the message to the server
    const { error } = await supabase.from('messages').insert([newMsg]);

    if (error) {
      console.error('Error sending message:', error);
      // Remove the optimistic message if there was an error
      setMessages((currentMessages) =>
        currentMessages.filter((msg) => msg.id !== optimisticMessage.id)
      );
      setNewMessage(newMsg.content); // Restore the message content
      alert('Failed to send message. Please try again.');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type and size
    const fileType = file.type.split('/')[0];
    if (fileType !== 'image') {
      alert('Please upload an image file');
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      alert('File size must be less than 5MB');
      return;
    }

    setUploading(true);
    try {
      // Create a unique file name
      const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${currentUser.id}/${fileName}`;

      // Upload the file
      const { error: uploadError } = await supabase.storage
        .from('chat-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get the public URL
      const { data } = supabase.storage
        .from('chat-images')
        .getPublicUrl(filePath);

      if (!data.publicUrl) {
        throw new Error('Failed to get public URL for uploaded image');
      }

      // Create the message with the image URL
      const { error: messageError } = await supabase.from('messages').insert([
        {
          sender_id: currentUser.id,
          receiver_id: selectedUser.id,
          image_url: data.publicUrl,
        },
      ]);

      if (messageError) {
        throw messageError;
      }

      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center space-x-3">
          <img
            src={selectedUser.avatar_url || 'https://via.placeholder.com/40'}
            alt={selectedUser.username}
            className="w-10 h-10 rounded-full"
          />
          <div>
            <h3 className="font-semibold">{selectedUser.username}</h3>
            <p className="text-sm text-gray-500">
              {selectedUser.status === 'online'
                ? 'Online'
                : `Last seen ${formatDistanceToNow(
                    new Date(selectedUser.last_seen),
                    { addSuffix: true }
                  )}`}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.sender_id === currentUser.id ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-sm rounded-lg p-4 ${
                message.sender_id === currentUser.id
                  ? 'bg-blue-500 text-white'
                  : 'bg-white border border-gray-200'
              }`}
            >
              {message.content && <p>{message.content}</p>}
              {message.image_url && (
                <img
                  src={message.image_url}
                  alt="Shared image"
                  className="rounded-lg max-w-sm"
                  loading="lazy"
                />
              )}
              <div
                className={`text-xs mt-1 ${
                  message.sender_id === currentUser.id
                    ? 'text-blue-100'
                    : 'text-gray-500'
                }`}
              >
                {formatDistanceToNow(new Date(message.created_at), {
                  addSuffix: true,
                })}
                {message.sender_id === currentUser.id && (
                  <span className="ml-2">
                    {message.read ? '✓✓' : '✓'}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <form
        onSubmit={handleSendMessage}
        className="px-6 py-4 bg-white border-t border-gray-200"
      >
        <div className="flex space-x-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"
            disabled={uploading}
          >
            <ImageIcon className="w-5 h-5" />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || uploading}
            className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
}