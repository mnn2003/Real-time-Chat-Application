import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../App';

interface UserListProps {
  currentUserId: string;
  onSelectUser: (user: Profile) => void;
}

export default function UserList({ currentUserId, onSelectUser }: UserListProps) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchUsers();
    const subscription = supabase
      .channel('profiles')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          fetchUsers();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [currentUserId]);

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', currentUserId)
      .order('username');

    if (error) {
      console.error('Error fetching users:', error);
    } else {
      setUsers(data || []);
    }
  };

  const filteredUsers = users.filter((user) =>
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-200">
        {filteredUsers.map((user) => (
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
              <h3 className="text-sm font-medium text-gray-900 truncate">
                {user.username}
              </h3>
              <p className="text-sm text-gray-500">
                {user.status === 'online'
                  ? 'Online'
                  : `Last seen ${new Date(user.last_seen).toLocaleDateString()}`}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}