"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Network, Mail, RefreshCw, Unlink, Users, Shield, ArrowUpRight, ArrowDownLeft, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Connection {
  id: string;
  provider: "google" | "microsoft";
  providerEmail: string | null;
  lastScanAt: string | null;
  scanStatus: "idle" | "scanning" | "done" | "error";
  scanError: string | null;
  emailsProcessed: number | null;
}

interface Relationship {
  id: string;
  firmDomain: string;
  firmName: string;
  firmId: string | null;
  firmWebsite: string | null;
  tier: "weak" | "fair" | "strong";
  strength: number;
  emailCount: number | null;
  sentCount: number | null;
  receivedCount: number | null;
  lastContactAt: string | null;
  bidirectional: boolean | null;
  provider: string;
}

type ActionFilter = "all" | "on-cos" | "invite";

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const TIER_CONFIG = {
  strong: { label: "Strong", className: "bg-cos-signal/10 text-cos-signal", dot: "bg-cos-signal" },
  fair:   { label: "Fair",   className: "bg-amber-50 text-amber-600",        dot: "bg-amber-400" },
  weak:   { label: "Weak",   className: "bg-cos-slate/10 text-cos-slate",    dot: "bg-cos-slate-light" },
};

// ─── Provider Card ────────────────────────────────────────────────────────────

function ProviderCard({
  provider,
  connection,
  onScan,
  onDisconnect,
  scanning,
}: {
  provider: "google" | "microsoft";
  connection: Connection | undefined;
  onScan: (provider: "google" | "microsoft") => void;
  onDisconnect: (provider: "google" | "microsoft") => void;
  scanning: boolean;
}) {
  const isGoogle = provider === "google";
  const label = isGoogle ? "Gmail" : "Outlook";
  const sublabel = isGoogle ? "Google Workspace / Gmail" : "Microsoft 365 / Outlook";
  const isMsConfigured = !!process.env.NEXT_PUBLIC_MICROSOFT_ENABLED;
  const isConnected = !!connection;
  const disabled = !isGoogle && !isMsConfigured;
  const isScanning = connection?.scanStatus === "scanning" || scanning;

  const handleConnect = async () => {
    try {
      const res = await fetch(`/api/settings/network/connect/${provider}`);
      if (res.status === 401) { window.location.href = "/login"; return; }
      if (!res.ok) return;
      const { url } = await res.json() as { url: string };
      window.location.href = url;
    } catch (err) {
      console.error("Network connect error:", err);
    }
  };

  return (
    <div className={cn(
      "rounded-cos-xl border bg-cos-surface overflow-hidden transition-shadow hover:shadow-sm",
      isConnected ? "border-cos-electric/20" : "border-cos-border",
      disabled && "opacity-60"
    )}>
      {/* Header bar */}
      <div className={cn(
        "flex items-center gap-3 px-4 py-3 border-b",
        isConnected ? "border-cos-electric/10 bg-cos-electric/[0.03]" : "border-cos-border bg-cos-cloud-dim"
      )}>
        <div className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-cos-lg",
          isGoogle ? "bg-white shadow-sm border border-cos-border/50" : "bg-blue-50"
        )}>
          {isGoogle ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4">
              <path fill="#0078D4" d="M0 0h11.377v11.372H0zm12.623 0H24v11.372H12.623zM0 12.623h11.377V24H0zm12.623 0H24V24H12.623z"/>
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-cos-midnight leading-tight">{label}</p>
          <p className="text-[11px] text-cos-slate">{sublabel}</p>
        </div>
        {isConnected && (
          <span className="flex items-center gap-1 rounded-full bg-cos-signal/10 px-2 py-0.5 text-[11px] font-medium text-cos-signal shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-cos-signal" />
            Connected
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {disabled && (
          <p className="text-xs text-cos-slate italic py-1">Microsoft integration coming soon.</p>
        )}

        {!disabled && isConnected && connection ? (
          <>
            {/* Account + scan stats */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-cos-midnight font-medium">
                <Mail className="h-3.5 w-3.5 text-cos-slate shrink-0" />
                <span className="truncate">{connection.providerEmail ?? "Account connected"}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-cos-lg bg-cos-cloud-dim px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-cos-slate font-medium mb-0.5">Last scan</p>
                  <p className="text-sm font-semibold text-cos-midnight">
                    {connection.lastScanAt ? formatRelativeTime(connection.lastScanAt) : "—"}
                  </p>
                </div>
                <div className="rounded-cos-lg bg-cos-cloud-dim px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-cos-slate font-medium mb-0.5">Emails analyzed</p>
                  <p className="text-sm font-semibold text-cos-midnight">
                    {connection.emailsProcessed ? connection.emailsProcessed.toLocaleString() : "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Scan status */}
            {connection.scanStatus === "done" && (
              <div className="flex items-center gap-1.5 text-[11px] text-cos-signal">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Scan complete
              </div>
            )}
            {connection.scanStatus === "error" && connection.scanError && (
              <div className="flex items-start gap-1.5 text-[11px] text-cos-ember">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{connection.scanError}</span>
              </div>
            )}
            {isScanning && (
              <div className="flex items-center gap-1.5 text-[11px] text-cos-electric">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Scanning headers…
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-0.5">
              <button
                onClick={() => onScan(provider)}
                disabled={isScanning}
                className={cn(
                  "flex items-center gap-1.5 rounded-cos-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  isScanning
                    ? "bg-cos-border text-cos-slate cursor-not-allowed"
                    : "bg-cos-electric text-white hover:bg-cos-electric/90"
                )}
              >
                <RefreshCw className={cn("h-3 w-3", isScanning && "animate-spin")} />
                {isScanning ? "Scanning…" : connection.lastScanAt ? "Re-scan" : "Scan Now"}
              </button>
              <button
                onClick={() => onDisconnect(provider)}
                className="flex items-center gap-1 text-xs text-cos-slate hover:text-cos-ember transition-colors"
              >
                <Unlink className="h-3 w-3" />
                Disconnect
              </button>
            </div>
          </>
        ) : !disabled ? (
          <button
            onClick={handleConnect}
            className="flex w-full items-center justify-center gap-2 rounded-cos-lg border border-cos-border bg-cos-cloud-dim px-4 py-2.5 text-sm font-medium text-cos-midnight transition-colors hover:border-cos-electric/40 hover:bg-cos-electric/5 hover:text-cos-electric"
          >
            Connect {label}
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ─── Relationship Card ────────────────────────────────────────────────────────

function RelationshipCard({ rel }: { rel: Relationship }) {
  const isOnCos = !!rel.firmId;
  const tier = TIER_CONFIG[rel.tier];

  const handleInvite = () => {
    const subject = encodeURIComponent("You should check out Collective OS");
    const body = encodeURIComponent(
      `Hi,\n\nI've been using Collective OS to build and manage industry partnerships, and I think your firm would be a great fit.\n\nIt's a platform that helps professional services firms grow through partnerships — matching, intros, and shared deal flow. You can learn more at joincollectiveos.com.\n\nWould love to connect there!`
    );
    window.location.href = `mailto:hello@${rel.firmDomain}?subject=${subject}&body=${body}`;
  };

  const websiteHref = rel.firmWebsite
    ? rel.firmWebsite.startsWith("http") ? rel.firmWebsite : `https://${rel.firmWebsite}`
    : null;

  const strengthPct = Math.round((rel.strength ?? 0) * 100);

  return (
    <div className="flex items-center gap-3 rounded-cos-xl border border-cos-border bg-cos-surface px-4 py-3 transition-shadow hover:shadow-sm">
      {/* Tier dot */}
      <div className={cn("h-2 w-2 shrink-0 rounded-full mt-0.5", tier.dot)} />

      {/* Main info */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-cos-midnight truncate">{rel.firmName}</p>
          <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", tier.className)}>
            {tier.label}
          </span>
          {isOnCos && (
            <span className="shrink-0 rounded-full bg-cos-electric/10 px-1.5 py-0.5 text-[10px] font-semibold text-cos-electric">
              on COS
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-cos-slate flex-wrap">
          {websiteHref ? (
            <a href={websiteHref} target="_blank" rel="noopener noreferrer"
              className="hover:text-cos-electric transition-colors truncate max-w-[160px]">
              {rel.firmDomain}
            </a>
          ) : (
            <span className="truncate max-w-[160px]">{rel.firmDomain}</span>
          )}

          {rel.sentCount !== null && rel.receivedCount !== null && (
            <span className="flex items-center gap-2 shrink-0">
              <span className="flex items-center gap-0.5">
                <ArrowUpRight className="h-3 w-3 text-cos-electric/70" />
                {rel.sentCount} sent
              </span>
              <span className="flex items-center gap-0.5">
                <ArrowDownLeft className="h-3 w-3 text-cos-slate" />
                {rel.receivedCount} received
              </span>
            </span>
          )}

          {rel.lastContactAt && (
            <span className="flex items-center gap-0.5 shrink-0">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(rel.lastContactAt)}
            </span>
          )}
        </div>

        {/* Strength bar */}
        <div className="flex items-center gap-2 pt-0.5">
          <div className="h-1 flex-1 rounded-full bg-cos-border overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", {
                "bg-cos-signal": rel.tier === "strong",
                "bg-amber-400": rel.tier === "fair",
                "bg-cos-slate-light": rel.tier === "weak",
              })}
              style={{ width: `${strengthPct}%` }}
            />
          </div>
          <span className="text-[10px] text-cos-slate shrink-0 w-7 text-right">{strengthPct}%</span>
        </div>
      </div>

      {/* CTA */}
      {isOnCos ? (
        <a
          href={`/discover/${rel.firmId}`}
          className="shrink-0 flex items-center gap-1 rounded-cos-lg bg-cos-electric/10 px-3 py-1.5 text-xs font-medium text-cos-electric hover:bg-cos-electric/20 transition-colors"
        >
          <Users className="h-3 w-3" />
          View
        </a>
      ) : (
        <button
          onClick={handleInvite}
          className="shrink-0 flex items-center gap-1 rounded-cos-lg border border-cos-border px-3 py-1.5 text-xs font-medium text-cos-slate hover:border-cos-electric/30 hover:text-cos-electric transition-colors"
        >
          <Mail className="h-3 w-3" />
          Invite
        </button>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NetworkScanPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [scanning, setScanning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    const res = await fetch("/api/settings/network/status");
    if (!res.ok) return;
    const data = await res.json() as { connections: Connection[]; relationships: Relationship[] };
    setConnections(data.connections ?? []);
    setRelationships(data.relationships ?? []);

    const anyScanning = (data.connections ?? []).some(c => c.scanStatus === "scanning");
    if (!anyScanning) {
      setScanning(false);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
  }, []);

  useEffect(() => {
    fetchStatus().finally(() => setLoading(false));
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) window.history.replaceState({}, "", "/settings/network");
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus]);

  const handleScan = async (provider: "google" | "microsoft") => {
    setScanning(true);
    await fetch("/api/settings/network/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    if (!pollRef.current) pollRef.current = setInterval(fetchStatus, 3000);
  };

  const handleDisconnect = async (provider: "google" | "microsoft") => {
    await fetch("/api/settings/network/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    await fetchStatus();
  };

  const googleConn = connections.find(c => c.provider === "google");
  const microsoftConn = connections.find(c => c.provider === "microsoft");
  const isScanning = connections.some(c => c.scanStatus === "scanning");

  const cosMatches = relationships.filter(r => r.firmId).length;
  const toInvite = relationships.filter(r => !r.firmId).length;
  const strong = relationships.filter(r => r.tier === "strong").length;

  const filtered =
    actionFilter === "on-cos" ? relationships.filter(r => r.firmId) :
    actionFilter === "invite" ? relationships.filter(r => !r.firmId) :
    relationships;

  return (
    <div className="w-full space-y-6 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-cos-electric" />
          <h2 className="font-heading text-lg font-semibold text-cos-midnight">Scan My Network</h2>
        </div>
        <p className="mt-1 text-sm text-cos-slate">
          Discover who you already know in the industry. We only read email headers — never message content.
        </p>
      </div>

      {/* Provider Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ProviderCard
          provider="google"
          connection={googleConn}
          onScan={handleScan}
          onDisconnect={handleDisconnect}
          scanning={scanning && googleConn?.scanStatus === "scanning"}
        />
        <ProviderCard
          provider="microsoft"
          connection={microsoftConn}
          onScan={handleScan}
          onDisconnect={handleDisconnect}
          scanning={scanning && microsoftConn?.scanStatus === "scanning"}
        />
      </div>

      {/* Scanning progress banner */}
      {isScanning && (
        <div className="rounded-cos-xl border border-cos-electric/20 bg-cos-electric/5 p-4 flex items-center gap-3">
          <RefreshCw className="h-4 w-4 text-cos-electric animate-spin shrink-0" />
          <div>
            <p className="text-sm font-medium text-cos-electric">Scanning your inbox…</p>
            <p className="text-xs text-cos-slate mt-0.5">
              Reading email headers from the last 3 years. Usually takes 30–60 seconds.
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && relationships.length > 0 && (
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Relationships", value: relationships.length, sub: "verified contacts" },
              { label: "Strong ties",   value: strong,               sub: "high-activity" },
              { label: "On COS",        value: cosMatches,           sub: "ready to connect" },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-cos-xl border border-cos-border bg-cos-surface px-4 py-3 text-center">
                <p className="text-2xl font-bold text-cos-midnight">{value}</p>
                <p className="text-xs font-medium text-cos-midnight mt-0.5">{label}</p>
                <p className="text-[10px] text-cos-slate">{sub}</p>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 rounded-cos-lg border border-cos-border bg-cos-cloud-dim p-1 w-fit">
            {([
              { key: "all",    label: "All",     count: relationships.length },
              { key: "on-cos", label: "On COS",  count: cosMatches },
              { key: "invite", label: "Invite",  count: toInvite },
            ] as { key: ActionFilter; label: string; count: number }[]).map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setActionFilter(key)}
                className={cn(
                  "rounded-cos-md px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5",
                  actionFilter === key
                    ? "bg-cos-electric text-white shadow-sm"
                    : "text-cos-slate hover:text-cos-midnight"
                )}
              >
                {label}
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  actionFilter === key ? "bg-white/20 text-white" : "bg-cos-border text-cos-slate"
                )}>
                  {count}
                </span>
              </button>
            ))}
          </div>

          {/* Relationship list */}
          <div className="space-y-2">
            {filtered.map((rel) => (
              <RelationshipCard key={rel.id} rel={rel} />
            ))}
            {filtered.length === 0 && (
              <p className="text-center py-8 text-sm text-cos-slate">No results for this filter.</p>
            )}
          </div>
        </div>
      )}

      {/* Empty — connected, no scan yet */}
      {!loading && relationships.length === 0 && connections.length > 0 && !isScanning && (
        <div className="rounded-cos-xl border border-dashed border-cos-border p-10 text-center">
          <Mail className="mx-auto h-8 w-8 text-cos-slate-light mb-3" />
          <p className="text-sm font-medium text-cos-midnight">Ready to scan</p>
          <p className="mt-1 text-xs text-cos-slate max-w-xs mx-auto">
            Click &quot;Scan Now&quot; above to discover your industry relationships.
          </p>
        </div>
      )}

      {/* Empty — not connected */}
      {!loading && connections.length === 0 && (
        <div className="rounded-cos-xl border border-dashed border-cos-border p-10 text-center">
          <Network className="mx-auto h-8 w-8 text-cos-slate-light mb-3" />
          <p className="text-sm font-medium text-cos-midnight">Connect your inbox to get started</p>
          <p className="mt-1 text-xs text-cos-slate max-w-sm mx-auto">
            We scan email headers (not content) to find firms you already have relationships with,
            then help you turn them into formal partnerships.
          </p>
        </div>
      )}

      {/* Privacy note */}
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-cos-slate-light">
        <Shield className="h-3 w-3" />
        From/To/Date headers only — never message content or attachments. Disconnect anytime.
      </div>
    </div>
  );
}
