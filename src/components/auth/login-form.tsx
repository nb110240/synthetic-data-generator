'use client';

import { useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Button } from '@/components/ui/button';
import { Github, X, Terminal, Loader2 } from 'lucide-react';

interface LoginFormProps {
  onClose?: () => void;
}

export function LoginForm({ onClose }: LoginFormProps) {
  const { signIn } = useAuthActions();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGitHubSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn('github', { redirectTo: '/' });
    } catch (err) {
      console.error('Sign in error:', err);
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md border border-border rounded-lg bg-card overflow-hidden animate-in">
      {/* Header */}
      <div className="terminal-header justify-between">
        <div className="flex items-center gap-2">
          <div className="terminal-dot terminal-dot-red" />
          <div className="terminal-dot terminal-dot-yellow" />
          <div className="terminal-dot terminal-dot-green" />
          <span className="ml-3 text-xs font-mono text-muted-foreground">auth.login</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded bg-lime/10 border border-lime/30 flex items-center justify-center">
            <Terminal className="h-5 w-5 text-lime" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Sign In</h2>
            <p className="text-sm text-muted-foreground">Continue with GitHub</p>
          </div>
        </div>

        <Button
          onClick={handleGitHubSignIn}
          disabled={isLoading}
          className="w-full h-12 bg-[#24292e] text-white font-semibold hover:bg-[#24292e]/90 transition-all disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          ) : (
            <Github className="h-5 w-5 mr-2" />
          )}
          {isLoading ? 'Redirecting...' : 'Sign in with GitHub'}
        </Button>

        {error && (
          <p className="text-xs text-destructive text-center mt-4 font-mono">
            {error}
          </p>
        )}

        <p className="text-xs text-muted-foreground text-center mt-6">
          Sign in to save and view your dataset history.
        </p>
      </div>
    </div>
  );
}
