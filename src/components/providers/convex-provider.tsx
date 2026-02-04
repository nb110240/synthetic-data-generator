'use client';

import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider, useAuthToken } from '@convex-dev/auth/react';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

// Create client only if URL is configured
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

// Custom auth context for components to use
interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  isLoading: false,
  isAuthenticated: false,
});

export const useAuthContext = () => useContext(AuthContext);

// Internal component that uses Convex auth hooks (only rendered when Convex is configured)
function ConvexAuthBridge({ children }: { children: ReactNode }) {
  const token = useAuthToken();
  const [isLoading, setIsLoading] = useState(true);

  // Token presence indicates authentication
  const isAuthenticated = token !== null;

  useEffect(() => {
    // After initial render, we know the auth state
    setIsLoading(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isLoading, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
}

export function ConvexProvider({ children }: { children: ReactNode }) {
  // If Convex is not configured, provide fallback unauthenticated context
  if (!convex) {
    return (
      <AuthContext.Provider value={{ isLoading: false, isAuthenticated: false }}>
        {children}
      </AuthContext.Provider>
    );
  }

  return (
    <ConvexAuthProvider client={convex}>
      <ConvexAuthBridge>
        {children}
      </ConvexAuthBridge>
    </ConvexAuthProvider>
  );
}
