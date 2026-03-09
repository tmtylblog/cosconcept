"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Save,
  ShieldCheck,
  CircleDashed,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface EnvVarInfo {
  key: string;
  label: string;
  description: string;
  phase: string;
  required: boolean;
  isSet: boolean;
  envId: string | null;
  targets: string[];
}

interface EnvVarsResponse {
  variables: EnvVarInfo[];
}

function CredentialRow({
  envVar,
  onSave,
}: {
  envVar: EnvVarInfo;
  onSave: (key: string, value: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!value.trim()) return;
    setSaving(true);
    setError(null);
    const success = await onSave(envVar.key, value.trim());
    setSaving(false);
    if (success) {
      setSaved(true);
      setEditing(false);
      setValue("");
      setTimeout(() => setSaved(false), 3000);
    } else {
      setError("Failed to save");
    }
  }

  return (
    <div
      className={cn(
        "rounded-cos-xl border bg-cos-surface p-5 transition-all",
        envVar.isSet || saved
          ? "border-cos-border"
          : envVar.required
            ? "border-cos-warm/30"
            : "border-cos-border/50"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-cos-midnight">
              {envVar.label}
            </h3>
            <span className="shrink-0 rounded-cos-pill bg-cos-cloud px-2 py-0.5 text-[10px] font-medium text-cos-slate">
              {envVar.phase}
            </span>
            {envVar.required && (
              <span className="shrink-0 rounded-cos-pill bg-cos-warm/10 px-2 py-0.5 text-[10px] font-medium text-cos-warm">
                Required
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-cos-slate">{envVar.description}</p>
          <code className="mt-1 block text-[11px] text-cos-slate/60">
            {envVar.key}
          </code>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {saved ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-cos-signal">
              <Check className="h-3.5 w-3.5" />
              Saved
            </span>
          ) : envVar.isSet ? (
            <span className="inline-flex items-center gap-1.5 rounded-cos-pill border border-cos-signal/20 bg-cos-signal/8 px-2.5 py-1 text-xs font-medium text-cos-signal">
              <ShieldCheck className="h-3 w-3" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-cos-pill border border-cos-border bg-cos-cloud px-2.5 py-1 text-xs font-medium text-cos-slate/60">
              <CircleDashed className="h-3 w-3" />
              Not Set
            </span>
          )}
        </div>
      </div>

      {/* Edit area */}
      {editing ? (
        <div className="mt-4 space-y-3">
          <div className="relative">
            <input
              type={showValue ? "text" : "password"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={`Enter ${envVar.label} key...`}
              className="w-full rounded-cos-lg border border-cos-border bg-cos-cloud px-3 py-2.5 pr-10 font-mono text-xs text-cos-midnight placeholder:text-cos-slate/40 focus:border-cos-electric/40 focus:outline-none focus:ring-2 focus:ring-cos-electric/10"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && value.trim()) handleSave();
                if (e.key === "Escape") {
                  setEditing(false);
                  setValue("");
                }
              }}
            />
            <button
              onClick={() => setShowValue(!showValue)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-cos-slate/50 hover:text-cos-midnight"
              type="button"
            >
              {showValue ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          {error && (
            <p className="flex items-center gap-1 text-xs text-cos-ember">
              <AlertTriangle className="h-3 w-3" />
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !value.trim()}
              className="inline-flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-cos-electric/90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              {envVar.isSet ? "Update" : "Save"} to Vercel
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setValue("");
                setError(null);
              }}
              className="rounded-cos-lg px-3 py-1.5 text-xs font-medium text-cos-slate transition-colors hover:bg-cos-cloud hover:text-cos-midnight"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-cos-electric transition-colors hover:text-cos-electric/80"
        >
          <KeyRound className="h-3 w-3" />
          {envVar.isSet ? "Update credential" : "Add credential"}
        </button>
      )}
    </div>
  );
}

export default function AdminCredentialsPage() {
  const [data, setData] = useState<EnvVarsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchEnvVars() {
    try {
      const res = await fetch("/api/admin/env-vars");
      if (res.ok) {
        setData(await res.json());
      } else {
        const err = await res.json();
        setError(err.error || "Failed to load");
      }
    } catch {
      setError("Failed to fetch credentials");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEnvVars();
  }, []);

  async function handleSave(key: string, value: string): Promise<boolean> {
    try {
      const res = await fetch("/api/admin/env-vars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (res.ok) {
        // Refresh the list to show updated status
        await fetchEnvVars();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 rounded-cos-md bg-cos-border" />
        <div className="space-y-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-28 rounded-cos-xl bg-cos-border/50" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <AlertTriangle className="h-8 w-8 text-cos-ember" />
        <p className="text-sm text-cos-ember">{error}</p>
        <Link
          href="/admin/api-health"
          className="text-xs text-cos-electric hover:underline"
        >
          Back to API Health
        </Link>
      </div>
    );
  }

  const vars = data?.variables || [];
  const configured = vars.filter((v) => v.isSet);
  const missing = vars.filter((v) => !v.isSet && v.required);
  const optional = vars.filter((v) => !v.isSet && !v.required);

  // Group by phase
  const phases = Array.from(new Set(vars.map((v) => v.phase))).sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/admin/api-health"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-cos-electric transition-colors hover:text-cos-electric/80"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to API Health
        </Link>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
          API Credentials
        </h1>
        <p className="mt-1 text-sm text-cos-slate">
          Manage API keys and connection strings. Changes are saved directly to
          Vercel and require a redeploy to take effect.
        </p>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-cos-pill border border-cos-signal/20 bg-cos-signal/8 px-3 py-1.5 text-xs font-medium text-cos-signal">
          <ShieldCheck className="h-3.5 w-3.5" />
          {configured.length} connected
        </span>
        {missing.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-cos-pill border border-cos-warm/20 bg-cos-warm/8 px-3 py-1.5 text-xs font-medium text-cos-warm">
            <AlertTriangle className="h-3.5 w-3.5" />
            {missing.length} required missing
          </span>
        )}
        {optional.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-cos-pill border border-cos-border bg-cos-cloud px-3 py-1.5 text-xs font-medium text-cos-slate">
            <CircleDashed className="h-3.5 w-3.5" />
            {optional.length} optional
          </span>
        )}
      </div>

      {/* Credentials by phase */}
      {phases.map((phase) => {
        const phaseVars = vars.filter((v) => v.phase === phase);
        return (
          <div key={phase} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
              {phase}
            </h2>
            {phaseVars.map((envVar) => (
              <CredentialRow
                key={envVar.key}
                envVar={envVar}
                onSave={handleSave}
              />
            ))}
          </div>
        );
      })}

      {/* Note about redeploy */}
      <div className="rounded-cos-xl border border-cos-electric/20 bg-cos-electric/5 p-4">
        <p className="text-xs text-cos-electric">
          <strong>Note:</strong> After adding or updating credentials, you need
          to redeploy the application for changes to take effect. You can trigger
          a redeploy from the Vercel dashboard or by pushing a new commit.
        </p>
      </div>
    </div>
  );
}
