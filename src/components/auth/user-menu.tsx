'use client';

import { useAuthActions } from '@convex-dev/auth/react';
import { Button } from '@/components/ui/button';
import { LogOut, User } from 'lucide-react';

interface UserMenuProps {
  user?: {
    id: string;
    email?: string;
    name?: string;
  };
}

export function UserMenu({ user }: UserMenuProps) {
  const { signOut } = useAuthActions();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-sm">
        <User className="h-4 w-4 text-lime" />
        <span className="text-muted-foreground hidden sm:inline">
          {user?.email || user?.name || 'Signed In'}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSignOut}
        className="text-muted-foreground hover:text-foreground"
      >
        <LogOut className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">Sign Out</span>
      </Button>
    </div>
  );
}
