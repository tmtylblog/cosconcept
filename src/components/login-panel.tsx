"use client";

import { useState } from "react";
import Image from "next/image";
import { signIn, signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

interface LoginPanelProps {
  onSuccess?: () => void;
}

export function LoginPanel({ onSuccess }: LoginPanelProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleGoogleLogin() {
    setError("");
    setStatus("Redirecting to Google...");
    try {
      const result = await signIn.social({
        provider: "google",
        callbackURL: "/dashboard",
      });
      // Better Auth returns { data, error } — check for error response
      if (result?.error) {
        console.error("[LoginPanel] Google OAuth error:", result.error);
        setError(
          "Google login failed: " +
            (result.error.message || result.error.code || "Unknown error. Please try again or use email/password.")
        );
        setStatus("");
      }
      // If no error, browser should be redirecting to Google...
    } catch (err) {
      console.error("[LoginPanel] Google OAuth exception:", err);
      setError("Google login failed: " + (err instanceof Error ? err.message : String(err)));
      setStatus("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatus("");
    setLoading(true);

    try {
      if (isSignUp) {
        setStatus("Creating account...");
        const result = await signUp.email({
          email,
          password,
          name: name || email.split("@")[0],
        });
        if (result.error) {
          setError(result.error.message ?? "Sign up failed");
          setStatus("");
          return;
        }
        setStatus("Account created! Redirecting...");
      } else {
        setStatus("Signing in...");
        const result = await signIn.email({
          email,
          password,
        });
        if (result.error) {
          setError(result.error.message ?? "Sign in failed");
          setStatus("");
          return;
        }
        setStatus("Signed in! Redirecting...");
      }
      if (onSuccess) {
        onSuccess();
      } else {
        window.location.href = "/dashboard";
      }
    } catch (err) {
      setError("Error: " + (err instanceof Error ? err.message : String(err)));
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 px-2 py-4">
      {/* Branding */}
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-cos-2xl bg-gradient-to-br from-cos-electric to-cos-signal p-1">
          <Image
            src="/logo.png"
            alt="Collective OS"
            width={56}
            height={56}
            className="h-full w-full rounded-cos-xl object-cover"
          />
        </div>
        <h2 className="mt-4 font-heading text-xl font-bold text-cos-midnight">
          {isSignUp ? "Join Collective OS" : "Welcome Back"}
        </h2>
        <p className="mt-1 text-sm text-cos-slate">
          {isSignUp
            ? "Create a free account to save your conversation and unlock partner matching."
            : "Sign in to continue your growth journey."}
        </p>
      </div>

      {error && (
        <div className="rounded-cos-lg bg-cos-danger/10 p-3 text-sm text-cos-danger">
          {error}
        </div>
      )}

      {status && (
        <div className="rounded-cos-lg bg-cos-electric/10 p-3 text-sm text-cos-electric">
          {status}
        </div>
      )}

      <div className="space-y-3">
        {/* Google OAuth */}
        <Button
          className="w-full"
          variant="outline"
          onClick={handleGoogleLogin}
          type="button"
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </Button>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-cos-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-cos-surface px-2 text-cos-slate">or</span>
          </div>
        </div>

        {/* Email/password form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {isSignUp && (
            <input
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-2.5 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
            />
          )}
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-2.5 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-2.5 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "..." : isSignUp ? "Create Free Account" : "Sign In"}
          </Button>
        </form>
      </div>

      <p className="text-center text-xs text-cos-slate">
        {isSignUp ? "Already have an account?" : "Don\u0027t have an account?"}{" "}
        <button
          onClick={() => {
            setIsSignUp(!isSignUp);
            setError("");
            setStatus("");
          }}
          className="text-cos-electric hover:underline"
        >
          {isSignUp ? "Sign in" : "Sign up"}
        </button>
      </p>
    </div>
  );
}
