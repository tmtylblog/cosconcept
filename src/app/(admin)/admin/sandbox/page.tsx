"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FlaskConical,
  Rocket,
  Trash2,
  ExternalLink,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface SandboxSession {
  userId: string;
  name: string;
  email: string;
  createdAt: string;
  orgId: string;
  orgName: string;
  orgMetadata: string | null;
  firmId: string;
  website: string | null;
  enrichmentStatus: string | null;
}

function getSessionMode(s: SandboxSession): "pre-onboard" | "post-onboard" {
  try {
    const meta = typeof s.orgMetadata === "string" ? JSON.parse(s.orgMetadata) : s.orgMetadata;
    return meta?.mode === "pre-onboarded" ? "post-onboard" : "pre-onboard";
  } catch {
    return "pre-onboard";
  }
}

export default function SandboxPage() {
  const [sessions, setSessions] = useState<SandboxSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("chameleon.co");
  const [mode, setMode] = useState<"onboarding" | "pre-onboarded">("onboarding");

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sandbox/list");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error("Failed to fetch sandbox sessions:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  async function handleLaunch() {
    setLaunching(true);

    // Open blank tab synchronously (in click handler) to avoid popup blocker
    const newTab = window.open("about:blank", "_blank");

    try {
      const res = await fetch("/api/sandbox/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          domain: domain.trim() || undefined,
          mode,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        newTab?.close();
        alert(`Launch failed: ${err.error}`);
        return;
      }

      const data = await res.json();

      // Navigate the already-open tab to the login URL
      if (newTab) {
        newTab.location.href = data.loginUrl;
      } else {
        // Fallback if popup was still blocked
        window.open(data.loginUrl, "_blank");
      }

      // Refresh session list
      await fetchSessions();
    } catch (err) {
      newTab?.close();
      alert(`Launch failed: ${err}`);
    } finally {
      setLaunching(false);
    }
  }

  async function handleResume(userId: string) {
    setDeleting(userId); // reuse loading state for button disable

    // Open blank tab synchronously to avoid popup blocker
    const newTab = window.open("about:blank", "_blank");

    try {
      const res = await fetch("/api/sandbox/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) {
        const err = await res.json();
        newTab?.close();
        alert(`Resume failed: ${err.error}`);
        return;
      }

      const data = await res.json();
      if (newTab) {
        newTab.location.href = data.loginUrl;
      } else {
        window.open(data.loginUrl, "_blank");
      }
    } catch (err) {
      newTab?.close();
      alert(`Resume failed: ${err}`);
    } finally {
      setDeleting(null);
    }
  }

  async function handleDelete(userId: string) {
    setDeleting(userId);
    try {
      const res = await fetch(`/api/sandbox/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        alert(`Delete failed: ${err.error}`);
        return;
      }
      // Refresh from server to confirm deletion
      await fetchSessions();
    } catch (err) {
      alert(`Delete failed: ${err}`);
    } finally {
      setDeleting(null);
    }
  }

  async function handleDeleteAll() {
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/sandbox/cleanup", { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        alert(`Cleanup failed: ${err.error}`);
        return;
      }
      const data = await res.json();
      setSessions([]);
      setConfirmDeleteAll(false);
      alert(`Deleted ${data.deleted} sandbox users, ${data.orphanedOrgsDeleted} orphaned orgs.`);
    } catch (err) {
      alert(`Cleanup failed: ${err}`);
    } finally {
      setBulkDeleting(false);
    }
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-cos-midnight flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-cos-electric" />
          Test Sandbox
        </h1>
        <p className="text-sm text-cos-slate mt-1">
          Spin up throwaway test sessions to stress-test onboarding and matching.
        </p>
      </div>

      {/* Launch Form */}
      <div className="rounded-cos-lg border border-cos-border bg-cos-surface p-6">
        <h2 className="text-lg font-heading font-semibold text-cos-midnight mb-4">
          Launch a Test Session
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-cos-slate-dim mb-1">
              Persona Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Auto-generated if blank"
              className="w-full rounded-cos-md border border-cos-border bg-white px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:outline-none focus:ring-2 focus:ring-cos-electric/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-cos-slate-dim mb-1">
              Firm Domain
            </label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="e.g. chameleon.co"
              className="w-full rounded-cos-md border border-cos-border bg-white px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:outline-none focus:ring-2 focus:ring-cos-electric/30"
            />
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-sm font-medium text-cos-slate-dim mb-2">Mode</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="mode"
                checked={mode === "onboarding"}
                onChange={() => setMode("onboarding")}
                className="accent-cos-electric"
              />
              <span className="text-sm text-cos-midnight">Pre-Onboard</span>
              <span className="text-xs text-cos-slate-light">(full flow: enrichment + interview)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="mode"
                checked={mode === "pre-onboarded"}
                onChange={() => setMode("pre-onboarded")}
                className="accent-cos-electric"
              />
              <span className="text-sm text-cos-midnight">Post-Onboard</span>
              <span className="text-xs text-cos-slate-light">(skip to app with random answers)</span>
            </label>
          </div>
        </div>

        <Button
          onClick={handleLaunch}
          disabled={launching}
          className="bg-cos-electric hover:bg-cos-electric/90 text-white"
        >
          {launching ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Rocket className="h-4 w-4 mr-2" />
          )}
          {launching ? "Launching..." : "Launch Test Session"}
        </Button>
      </div>

      {/* Active Sessions */}
      <div className="rounded-cos-lg border border-cos-border bg-cos-surface p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-heading font-semibold text-cos-midnight">
            Active Test Sessions ({sessions.length})
          </h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchSessions}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            {sessions.length > 0 && !confirmDeleteAll && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDeleteAll(true)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete All
              </Button>
            )}
            {confirmDeleteAll && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  Delete all {sessions.length} sessions?
                </span>
                <Button
                  size="sm"
                  onClick={handleDeleteAll}
                  disabled={bulkDeleting}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDeleteAll(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-cos-slate">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading sessions...
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 text-cos-slate-light text-sm">
            No active test sessions. Launch one above to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cos-border text-left">
                  <th className="pb-2 font-medium text-cos-slate-dim">Name</th>
                  <th className="pb-2 font-medium text-cos-slate-dim">Domain</th>
                  <th className="pb-2 font-medium text-cos-slate-dim">Mode</th>
                  <th className="pb-2 font-medium text-cos-slate-dim">Status</th>
                  <th className="pb-2 font-medium text-cos-slate-dim">Created</th>
                  <th className="pb-2 font-medium text-cos-slate-dim text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.userId} className="border-b border-cos-border/50 hover:bg-cos-electric/5">
                    <td className="py-3">
                      <div className="font-medium text-cos-midnight">{s.name}</div>
                      <div className="text-xs text-cos-slate-light">{s.email}</div>
                    </td>
                    <td className="py-3 text-cos-slate">
                      {s.website ? s.website.replace("https://", "") : "(none)"}
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          getSessionMode(s) === "post-onboard"
                            ? "bg-cos-electric/10 text-cos-electric"
                            : "bg-cos-warm/10 text-cos-warm"
                        }`}
                      >
                        {getSessionMode(s) === "post-onboard" ? "Post" : "Pre"}
                      </span>
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.enrichmentStatus === "enriched"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {s.enrichmentStatus || "pending"}
                      </span>
                    </td>
                    <td className="py-3 text-cos-slate">{timeAgo(s.createdAt)}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResume(s.userId)}
                          disabled={deleting === s.userId}
                          title="Open new tab as this user"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(s.userId)}
                          disabled={deleting === s.userId}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          title="Delete this test session"
                        >
                          {deleting === s.userId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
