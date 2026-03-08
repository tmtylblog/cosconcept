"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useSession, authClient } from "@/lib/auth-client";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function ProfileSettingsPage() {
  const { data: session } = useSession();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-populate from session
  useEffect(() => {
    if (session?.user?.name) {
      setName(session.user.name);
    }
  }, [session?.user?.name]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name cannot be empty.");
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      await authClient.updateUser({
        name: name.trim(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("[Settings] Failed to update profile:", err);
      setError("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = name.trim() !== (session?.user?.name ?? "");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Profile
        </h2>
        <p className="mt-1 text-sm text-cos-slate">
          Your personal account details.
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5">
          <label className="block text-xs font-medium text-cos-slate">
            Full Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
              setSaved(false);
            }}
            placeholder="Your name"
            className="mt-1 w-full rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
          />
        </div>

        <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5">
          <label className="block text-xs font-medium text-cos-slate">
            Email
          </label>
          <input
            type="email"
            value={session?.user?.email ?? ""}
            disabled
            className="mt-1 w-full rounded-cos-lg border border-cos-border bg-cos-cloud px-3 py-2 text-sm text-cos-slate-dim"
          />
          <p className="mt-1 text-xs text-cos-slate-light">
            Email is linked to your account and cannot be changed.
          </p>
        </div>

        {error && (
          <p className="text-xs text-cos-ember">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>

          {saved && (
            <span className="flex items-center gap-1 text-xs text-cos-signal">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
