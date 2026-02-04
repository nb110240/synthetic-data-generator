'use client';

import { useAuthContext } from '@/components/providers/convex-provider';

interface User {
  id: string;
  email?: string;
  name?: string;
  image?: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export function useAuth(): AuthState {
  const { isLoading, isAuthenticated } = useAuthContext();

  return {
    user: isAuthenticated ? { id: 'authenticated' } : null,
    isLoading,
    isAuthenticated,
  };
}
