"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { authClient, useSession } from "@/lib/auth-client";
import {
  Loader2, CheckCircle2, Eye, EyeOff, Monitor, Smartphone,
  Tablet, LogOut, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── UA parser (no library — simple heuristic) ────────────

function parseUA(ua: string | null | undefined): { browser: string; os: string; device: "desktop" | "mobile" | "tablet" } {
  if (!ua) return { browser: "Unknown browser", os: "Unknown OS", device: "desktop" };

  const isMobile = /iPhone|Android.*Mobile|Windows Phone/i.test(ua);
  const isTablet = /iPad|Android(?!.*Mobile)/i.test(ua);
  const device = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";

  const browser =
    /Edg\//i.test(ua) ? "Edge" :
    /OPR\//i.test(ua) ? "Opera" :
    /Chrome\//i.test(ua) ? "Chrome" :
    /Firefox\//i.test(ua) ? "Firefox" :
    /Safari\//i.test(ua) ? "Safari" :
    "Browser";

  const os =
    /Windows NT 10/i.test(ua) ? "Windows 11/10" :
    /Windows NT/i.test(ua) ? "Windows" :
    /Mac OS X/i.test(ua) ? "macOS" :
    /iPhone OS/i.test(ua) ? "iOS" :
    /Android/i.test(ua) ? "Android" :
    /Linux/i.test(ua) ? "Linux" :
    "Unknown OS";

  return { browser, os, device };
}

function DeviceIcon({ device }: { device: "desktop" | "mobile" | "tablet" }) {
  const cls = "h-5 w-5 text-cos-slate";
  if (device === "mobile") return <Smartphone className={cls} />;
  if (device === "tablet") return <Tablet className={cls} />;
  return <Monitor className={cls} />;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Password section ──────────────────────────────────────

function PasswordSection() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null);

  async function handleSubmit() {
    if (!current || !next) { setResult({ error: "All fields required." }); return; }
    if (next.length < 8) { setResult({ error: "New password must be at least 8 characters." }); return; }
    if (next !== confirm) { setResult({ error: "Passwords don't match." }); return; }

    setSaving(true);
    setResult(null);
    try {
      const res = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: false });
      if (res.error) {
        setResult({ error: res.error.message ?? "Incorrect current password." });
      } else {
        setResult({ ok: true });
        setCurrent(""); setNext(""); setConfirm("");
        setTimeout(() => { setOpen(false); setResult(null); }, 2000);
      }
    } catch {
      setResult({ error: "Something went wrong. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-cos-xl border border-cos-border p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-cos-midnight">Password</p>
          <p className="mt-1 text-xs text-cos-slate">Change your account password.</p>
        </div>
        {!open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Change
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <PasswordField label="Current password" value={current} onChange={setCurrent} show={showCurrent} onToggle={() => setShowCurrent((s) => !s)} />
          <PasswordField label="New password" value={next} onChange={setNext} show={showNext} onToggle={() => setShowNext((s) => !s)} hint="At least 8 characters" />
          <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} show={showNext} onToggle={() => setShowNext((s) => !s)} />

          {result?.error && <p className="text-xs text-cos-ember">{result.error}</p>}
          {result?.ok && (
            <p className="flex items-center gap-1.5 text-xs text-cos-signal">
              <CheckCircle2 className="h-3.5 w-3.5" /> Password updated.
            </p>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Update Password"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setResult(null); setCurrent(""); setNext(""); setConfirm(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PasswordField({ label, value, onChange, show, onToggle, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  show: boolean; onToggle: () => void; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-cos-slate">{label}</label>
      <div className="relative mt-1">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-2 pr-9 text-sm text-cos-midnight focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
        />
        <button type="button" onClick={onToggle} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-cos-slate-light hover:text-cos-slate">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="mt-0.5 text-[11px] text-cos-slate-light">{hint}</p>}
    </div>
  );
}

// ─── Sessions section ──────────────────────────────────────

interface SessionItem {
  id: string;
  token: string;
  createdAt: string;
  updatedAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function SessionsSection() {
  const { data: currentSession } = useSession();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  useEffect(() => {
    authClient.listSessions()
      .then((res) => { if (res.data) setSessions(res.data as unknown as SessionItem[]); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function revokeSession(token: string, id: string) {
    setRevoking(id);
    try {
      await authClient.revokeSession({ token });
      setSessions((s) => s.filter((sess) => sess.id !== id));
    } finally {
      setRevoking(null);
    }
  }

  async function revokeOthers() {
    setRevokingAll(true);
    try {
      await authClient.revokeOtherSessions();
      setSessions((s) => s.filter((sess) => sess.token === currentSession?.session.token));
    } finally {
      setRevokingAll(false);
    }
  }

  const otherSessions = sessions.filter((s) => s.token !== currentSession?.session.token);

  return (
    <div className="rounded-cos-xl border border-cos-border p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-cos-midnight">Active Sessions</p>
          <p className="mt-1 text-xs text-cos-slate">Devices where you&apos;re signed in.</p>
        </div>
        {otherSessions.length > 0 && (
          <Button size="sm" variant="outline" className="text-cos-ember border-cos-ember/30 hover:bg-cos-ember/5" onClick={revokeOthers} disabled={revokingAll}>
            {revokingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><LogOut className="mr-1.5 h-3.5 w-3.5" />Sign out all others</>}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-cos-electric" />
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((sess) => {
            const { browser, os, device } = parseUA(sess.userAgent);
            const isCurrent = sess.token === currentSession?.session.token;
            const isRevoking = revoking === sess.id;

            return (
              <div key={sess.id} className={cn(
                "flex items-center gap-3 rounded-cos-xl border p-3",
                isCurrent ? "border-cos-electric/30 bg-cos-electric/5" : "border-cos-border"
              )}>
                <DeviceIcon device={device} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-cos-midnight">
                    {browser} on {os}
                    {isCurrent && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-cos-electric">This device</span>}
                  </p>
                  <p className="text-xs text-cos-slate">
                    {sess.ipAddress ? `${sess.ipAddress} · ` : ""}
                    {timeAgo(sess.updatedAt)}
                  </p>
                </div>
                {!isCurrent && (
                  <button
                    onClick={() => revokeSession(sess.token, sess.id)}
                    disabled={isRevoking}
                    className="shrink-0 rounded-cos-md px-2 py-1 text-xs text-cos-ember hover:bg-cos-ember/10 transition-colors disabled:opacity-50"
                  >
                    {isRevoking ? <Loader2 className="h-3 w-3 animate-spin" /> : "Sign out"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────

export default function SecuritySettingsPage() {
  return (
    <div className="w-full space-y-6 p-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">Security</h2>
        <p className="mt-1 text-sm text-cos-slate">Password, authentication, and access management.</p>
      </div>

      <div className="space-y-3">
        <PasswordSection />
        <SessionsSection />

        {/* 2FA — future */}
        <div className="rounded-cos-xl border border-cos-border p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 shrink-0 text-cos-slate-light mt-0.5" />
            <div>
              <p className="text-sm font-medium text-cos-midnight">Two-Factor Authentication</p>
              <p className="mt-1 text-xs text-cos-slate">Add an extra layer of security with an authenticator app.</p>
              <p className="mt-2 text-xs text-cos-slate-light">Coming soon.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
