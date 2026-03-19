"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { signIn, authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Loader2, Shield, AlertTriangle } from "lucide-react";

const ADMIN_ROLES = ["superadmin", "admin", "growth_ops", "customer_success"];

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // On mount: check if already logged in with an admin role
  useEffect(() => {
    (async () => {
      try {
        const { data: session } = await authClient.getSession();
        const role = (session?.user as { role?: string } | undefined)?.role ?? "user";
        if (session?.user && ADMIN_ROLES.includes(role)) {
          window.location.href = "/admin";
          return;
        }
        // If logged in but not admin, sign out so they can log in as admin
        if (session?.user) {
          await authClient.signOut();
        }
      } catch { /* no session */ }
      setChecking(false);
    })();
  }, []);

  async function handleGoogleLogin() {
    setError("");
    setStatus("Redirecting to Google...");
    try {
      await signIn.social({
        provider: "google",
        callbackURL: "/admin",
      });
    } catch (err) {
      setError("Google login failed: " + (err instanceof Error ? err.message : String(err)));
      setStatus("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }
    setError("");
    setStatus("Signing in...");
    setLoading(true);

    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "Sign in failed");
        setStatus("");
        return;
      }

      // Verify they have an admin role
      const { data: session } = await authClient.getSession();
      const role = (session?.user as { role?: string } | undefined)?.role ?? "user";

      if (!ADMIN_ROLES.includes(role)) {
        await authClient.signOut();
        setError("This account does not have admin access. Contact your administrator.");
        setStatus("");
        return;
      }

      setStatus("Welcome back! Redirecting to admin...");
      window.location.href = "/admin";
    } catch (err) {
      setError("Error: " + (err instanceof Error ? err.message : String(err)));
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cos-midnight">
        <Loader2 className="h-8 w-8 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-cos-midnight">
      {/* Left branding */}
      <div className="hidden w-1/2 flex-col justify-between p-12 lg:flex">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Collective OS" width={40} height={40} className="h-10 w-10 rounded-cos-lg" />
          <span className="font-heading text-xl font-bold text-white">Collective OS</span>
        </div>
        <div className="max-w-md">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="h-8 w-8 text-cos-electric" />
            <h1 className="font-heading text-3xl font-bold text-white">
              Admin Console
            </h1>
          </div>
          <p className="text-lg leading-relaxed text-white/60">
            Platform management, intelligence, growth operations, and customer success tools.
          </p>
        </div>
        <p className="text-sm text-white/20">
          Restricted access &mdash; admin credentials required
        </p>
      </div>

      {/* Right: login form */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          {/* Mobile header */}
          <div className="text-center lg:hidden">
            <Image src="/logo.png" alt="Collective OS" width={48} height={48} className="mx-auto h-12 w-12 rounded-cos-xl" />
            <h2 className="mt-3 font-heading text-xl font-bold text-white">Admin Console</h2>
          </div>

          <div className="space-y-5 rounded-cos-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6">
            <div>
              <h3 className="font-heading text-lg font-semibold text-white">
                Admin Sign In
              </h3>
              <p className="mt-1 text-sm text-white/50">
                Use your admin credentials to continue.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-cos-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {status && (
              <div className="rounded-cos-lg bg-cos-electric/10 p-3 text-sm text-cos-electric">
                {status}
              </div>
            )}

            <div className="space-y-3">
              {/* Google OAuth */}
              <button
                onClick={handleGoogleLogin}
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-cos-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-transparent px-2 text-white/30">or</span>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  placeholder="Admin email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  required
                  className="w-full rounded-cos-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-cos-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
                />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In to Admin"}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
