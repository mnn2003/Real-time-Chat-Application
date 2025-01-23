import React, { useEffect, useState } from 'react';
import { MessageCircle, Users, LogOut, Send, Image as ImageIcon } from 'lucide-react';
import { supabase } from './lib/supabase';
import Login from './components/Login';
import ChatList from './components/ChatList';
import ChatWindow from './components/ChatWindow';
import UserList from './components/UserList';

export type Profile = {
  id: string;
  username: string;
  avatar_url: string;
  status: string;
  last_seen: string;
};

export type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string | null;
  image_url: string | null;
  read: boolean;
  created_at: string;
};

function App() {
  const [session, setSession] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [showUserList, setShowUserList] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setCurrentUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
    } else {
      setCurrentUser(data);
      // Update user status to online
      await supabase
        .from('profiles')
        .update({ status: 'online' })
        .eq('id', userId);
    }
  };

  const handleSignOut = async () => {
    if (currentUser) {
      // Set status to offline before signing out
      await supabase
        .from('profiles')
        .update({ status: 'offline', last_seen: new Date().toISOString() })
        .eq('id', currentUser.id);
    }
    await supabase.auth.signOut();
  };

  if (!session) {
    return <Login />;
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        {/* User Profile */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <img
              src={currentUser?.avatar_url || 'https://via.placeholder.com/40'}
              alt="Profile"
              className="w-10 h-10 rounded-full"
            />
            <div className="flex-1">
              <h3 className="font-semibold">{currentUser?.username}</h3>
              <p className="text-sm text-green-500">Online</p>
            </div>
            <button
              onClick={handleSignOut}
              className="p-2 hover:bg-gray-100 rounded-full"
            >
              <LogOut className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setShowUserList(false)}
            className={`flex-1 p-4 text-center ${
              !showUserList ? 'border-b-2 border-blue-500' : ''
            }`}
          >
            <MessageCircle className="w-5 h-5 mx-auto" />
            <span className="text-sm mt-1 block">Chats</span>
          </button>
          <button
            onClick={() => setShowUserList(true)}
            className={`flex-1 p-4 text-center ${
              showUserList ? 'border-b-2 border-blue-500' : ''
            }`}
          >
            <Users className="w-5 h-5 mx-auto" />
            <span className="text-sm mt-1 block">Users</span>
          </button>
        </div>

        {/* User List or Chat List */}
        <div className="flex-1 overflow-y-auto">
          {showUserList ? (
            <UserList
              currentUserId={session.user.id}
              onSelectUser={setSelectedUser}
            />
          ) : (
            <ChatList
              currentUserId={session.user.id}
              onSelectUser={setSelectedUser}
            />
          )}
        </div>
      </div>

      {/* Chat Window */}
      <div className="flex-1">
        {selectedUser ? (
          <ChatWindow currentUser={currentUser!} selectedUser={selectedUser} />
        ) : (
          <div className="h-full flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <MessageCircle className="w-16 h-16 text-gray-400 mx-auto" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">
                Select a chat to start messaging
              </h3>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;