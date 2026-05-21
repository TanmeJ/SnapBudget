'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getStoredSession, saveSession } from '@/lib/auth';

type AuthMode = 'login' | 'signup';

interface AuthFormProps {
  mode: AuthMode;
}

interface AuthApiResponse {
  access_token: string;
  token_type: string;
  user: {
    id: number;
    email: string;
    created_at: string;
  };
}

interface AuthApiError {
  detail?: string;
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isLogin = mode === 'login';

  useEffect(() => {
    if (getStoredSession()) {
      router.replace('/');
    }
  }, [router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`/api/auth/${isLogin ? 'login' : 'signup'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const payload = (await response.json()) as AuthApiResponse | AuthApiError;
      if (!response.ok) {
        throw new Error(('detail' in payload && payload.detail) || 'Authentication failed');
      }

      if (!('user' in payload)) {
        throw new Error('Authentication response was missing user data');
      }

      saveSession({
        user: payload.user,
        access_token: payload.access_token,
      });

      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <main className="w-full max-w-6xl flex flex-col lg:flex-row bg-surface-container-lowest rounded-xl overflow-hidden shadow-ambient min-h-[800px]">
        <section className="lg:w-1/2 bg-surface-container-low p-12 flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center gap-3 z-10">
            <div className="w-10 h-10 bg-primary-gradient rounded-lg flex items-center justify-center text-on-primary">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                receipt_long
              </span>
            </div>
            <span className="font-headline text-xl font-extrabold tracking-tight text-primary">
              SnapBudget
            </span>
          </div>

          <div className="z-10 mt-12">
            <h1 className="text-4xl lg:text-5xl font-extrabold font-headline leading-tight text-on-surface mb-6">
              Receipt intelligence,
              <br />
              <span className="text-primary">ready for your ledger.</span>
            </h1>
            <p className="text-on-surface-variant text-lg max-w-md leading-relaxed">
              Scan receipts, extract structured data, and turn raw bills into searchable
              financial history.
            </p>

            <div className="grid grid-cols-2 gap-4 mt-12">
              <div className="bg-surface-container-lowest p-5 rounded-lg ghost-border">
                <span className="material-symbols-outlined text-primary mb-3">document_scanner</span>
                <h3 className="font-headline font-bold text-sm">OCR Pipeline</h3>
                <p className="text-xs text-on-surface-variant mt-1">FastAPI, Tesseract, OpenCV</p>
              </div>
              <div className="bg-surface-container-lowest p-5 rounded-lg ghost-border">
                <span className="material-symbols-outlined text-secondary mb-3">category</span>
                <h3 className="font-headline font-bold text-sm">AI Categorizer</h3>
                <p className="text-xs text-on-surface-variant mt-1">Smart expense grouping</p>
              </div>
            </div>
          </div>

          <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 right-0 w-64 h-64 bg-secondary/5 rounded-full blur-3xl" />

          <div className="mt-auto pt-12 z-10">
            <p className="text-sm text-on-surface-variant italic">
              Built for the flow: login, scan, review, analyze.
            </p>
          </div>
        </section>

        <section className="lg:w-1/2 p-12 lg:p-20 flex flex-col justify-center bg-surface-container-lowest">
          <div className="max-w-md mx-auto w-full">
            <header className="mb-10">
              <h2 className="text-3xl font-bold font-headline mb-2 text-on-surface">
                {isLogin ? 'Welcome back' : 'Create your account'}
              </h2>
              <p className="text-on-surface-variant">
                {isLogin
                  ? 'Sign in to view your dashboard and upload receipts.'
                  : 'Start saving receipts under your own account.'}
              </p>
            </header>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-on-surface-variant px-1">
                  Email
                </label>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary">
                    mail
                  </span>
                  <input
                    className="w-full pl-12 pr-4 py-4 bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-lowest transition-all placeholder:text-outline/60 text-on-surface"
                    placeholder="name@example.com"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between px-1">
                  <label className="text-sm font-semibold text-on-surface-variant">Password</label>
                  <span className="text-xs text-on-surface-variant">Minimum 8 characters</span>
                </div>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary">
                    lock
                  </span>
                  <input
                    className="w-full pl-12 pr-4 py-4 bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-lowest transition-all placeholder:text-outline/60 text-on-surface"
                    placeholder="••••••••"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={8}
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-error-container text-on-error-container px-4 py-3 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-primary-gradient rounded-full text-on-primary font-headline font-bold text-sm uppercase tracking-widest shadow-primary-glow hover:shadow-primary-glow-lg hover:scale-[1.01] active:scale-[0.98] transition-all disabled:opacity-70 disabled:hover:scale-100"
              >
                {loading ? 'Please wait...' : isLogin ? 'Sign In to SnapBudget' : 'Create Account'}
              </button>
            </form>

            <footer className="mt-12 text-center">
              <p className="text-on-surface-variant text-sm">
                {isLogin ? "Don't have an account? " : 'Already have an account? '}
                <Link
                  href={isLogin ? '/signup' : '/login'}
                  className="text-primary font-bold hover:underline"
                >
                  {isLogin ? 'Create one' : 'Sign in'}
                </Link>
              </p>
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
}
