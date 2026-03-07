'use client';

import { useRouter } from 'next/navigation';
import { LogOut, User } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';

export default function Header() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const roleLabel: Record<string, string> = {
    admin: 'Администратор',
    manager: 'Ревизор',
    uploader: 'Снабженец',
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-4">
        {user && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <User size={16} />
            <span>{user.firstName ?? user.email}</span>
            <span className="text-xs bg-gray-100 px-2 py-1 rounded">
              {roleLabel[user.role] ?? user.role}
            </span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="text-gray-400 hover:text-red-500 transition-colors"
          title="Выйти"
        >
          <LogOut size={20} />
        </button>
      </div>
    </header>
  );
}
