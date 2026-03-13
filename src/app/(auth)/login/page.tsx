"use client";

import { useState } from "react";
import Image from "next/image";
import { signIn, signUp, authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { isPersonalEmail, CORPORATE_EMAIL_ERROR } from "@/lib/email-validation";
import { ArrowLeft, Loader2 } from "lucide-react";

const ADMIN_ROLES = ["superadmin", "admin", "growth_ops", "customer_success"];

async function getPostLoginRedirect(): Promise<string> {
  try {
    const { data: session } = await authClient.getSession();
    const role = (session?.user as { role?: string } | undefined)?.role ?? "user";
    if (ADMIN_ROLES.includes(role)) return "/admin";
  } catch { /* fall through */ }
  return "/dashboard";
}

type View = "login" | "signup" | "forgot" | "forgot-sent";

export default function LoginPage() {
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  function switchView(v: View) {
    setView(v);
    setError("");
    setStatus("");
  }

  function validateEmail(): boolean {
    if (!email.trim()) {
      setError("Email is required");
      return false;
    }
    if (isPersonalEmail(email)) {
      setError(CORPORATE_EMAIL_ERROR);
      return false;
    }
    return true;
  }

  async function handleGoogleLogin() {
    setError("");
    setStatus("Redirecting to Google...");
    try {
      await signIn.social({
        provider: "google",
        callbackURL: "/dashboard",
      });
    } catch (err) {
      setError("Google login failed: " + (err instanceof Error ? err.message : String(err)));
      setStatus("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateEmail()) return;
    setError("");
    setStatus("");
    setLoading(true);

    try {
      if (view === "signup") {
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
        const result = await signIn.email({ email, password });
        if (result.error) {
          setError(result.error.message ?? "Sign in failed");
          setStatus("");
          return;
        }
        setStatus("Signed in! Redirecting...");
      }
      window.location.href = await getPostLoginRedirect();
    } catch (err) {
      setError("Error: " + (err instanceof Error ? err.message : String(err)));
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!validateEmail()) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, redirectTo: "/login" }),
      });
      if (!res.ok) throw new Error("Request failed");
      switchView("forgot-sent");
    } catch {
      setError("Failed to send reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-cos-cloud to-[#e8e4dd]">
      {/* Left: branding */}
      <div className="hidden w-1/2 flex-col justify-between bg-cos-midnight p-12 lg:flex">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Collective OS" width={40} height={40} className="h-10 w-10 rounded-cos-lg" />
          <span className="font-heading text-xl font-bold text-white">Collective OS</span>
        </div>
        <div className="max-w-md">
          <h1 className="font-heading text-4xl font-bold leading-tight text-white">
            Grow Faster Together
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-white/70">
            The operating system for partnership-led growth. Find, match, and
            manage the right partners for your professional services firm.
          </p>
        </div>
        <p className="text-sm text-white/30">
          joincollectiveos.com
        </p>
      </div>

      {/* Right: auth form */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          {/* Mobile logo */}
          <div className="text-center lg:hidden">
            <Image src="/logo.png" alt="Collective OS" width={48} height={48} className="mx-auto h-12 w-12 rounded-cos-xl" />
            <h2 className="mt-3 font-heading text-xl font-bold text-cos-midnight">Collective OS</h2>
          </div>

          {/* ─── Forgot Password (sent) ─── */}
          {view === "forgot-sent" && (
            <div className="space-y-4 rounded-cos-xl border border-cos-border bg-white p-6">
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cos-signal/10 text-cos-signal">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </div>
                <h3 className="mt-3 font-heading text-lg font-semibold text-cos-midnight">Check your email</h3>
                <p className="mt-1 text-sm text-cos-slate">
                  We sent a password reset link to <strong>{email}</strong>
                </p>
              </div>
              <button
                onClick={() => switchView("login")}
                className="flex w-full items-center justify-center gap-2 text-sm text-cos-electric hover:underline"
              >
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </button>
            </div>
          )}

          {/* ─── Forgot Password (form) ─── */}
          {view === "forgot" && (
            <div className="space-y-4 rounded-cos-xl border border-cos-border bg-white p-6">
              <div>
                <h3 className="font-heading text-lg font-semibold text-cos-midnight">Reset password</h3>
                <p className="mt-1 text-sm text-cos-slate">
                  Enter your work email and we&apos;ll send a reset link.
                </p>
              </div>

              {error && <ErrorBox message={error} />}

              <form onSubmit={handleForgotPassword} className="space-y-3">
                <input
                  type="email"
                  placeholder="Work email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-2.5 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
                />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Reset Link"}
                </Button>
              </form>
              <button
                onClick={() => switchView("login")}
                className="flex w-full items-center justify-center gap-2 text-sm text-cos-electric hover:underline"
              >
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </button>
            </div>
          )}

          {/* ─── Login / Signup ─── */}
          {(view === "login" || view === "signup") && (
            <div className="space-y-5 rounded-cos-xl border border-cos-border bg-white p-6">
              <div>
                <h3 className="font-heading text-lg font-semibold text-cos-midnight">
                  {view === "signup" ? "Create your account" : "Welcome back"}
                </h3>
                <p className="mt-1 text-sm text-cos-slate">
                  {view === "signup"
                    ? "Use your work email to get started."
                    : "Sign in with your work email."}
                </p>
              </div>

              {error && <ErrorBox message={error} />}
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
                  className="flex w-full items-center justify-center gap-2 rounded-cos-lg border border-cos-border bg-white px-4 py-2.5 text-sm font-medium text-cos-midnight shadow-sm transition-colors hover:bg-cos-cloud"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Continue with Google
                </button>

                <p className="text-center text-[11px] text-cos-slate-light">
                  Use your Google Workspace (corporate) account
                </p>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-cos-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-cos-slate">or</span>
                  </div>
                </div>

                {/* Email form */}
                <form onSubmit={handleSubmit} className="space-y-3">
                  {view === "signup" && (
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
                    placeholder="Work email (e.g., you@yourfirm.com)"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
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
                  {view === "login" && (
                    <div className="text-right">
                      <button
                        type="button"
                        onClick={() => switchView("forgot")}
                        className="text-xs text-cos-electric hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : view === "signup" ? "Create Account" : "Sign In"}
                  </Button>
                </form>
              </div>

              <p className="text-center text-xs text-cos-slate">
                {view === "signup" ? "Already have an account?" : "Don\u0027t have an account?"}{" "}
                <button
                  onClick={() => switchView(view === "signup" ? "login" : "signup")}
                  className="text-cos-electric hover:underline"
                >
                  {view === "signup" ? "Sign in" : "Sign up"}
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-cos-lg bg-red-50 p-3 text-sm text-red-600">
      {message}
    </div>
  );
}
