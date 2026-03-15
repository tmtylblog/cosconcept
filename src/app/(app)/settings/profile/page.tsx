"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useSession, authClient } from "@/lib/auth-client";
import { Loader2, CheckCircle2 } from "lucide-react";

interface ProfileFields {
  name: string;
  jobTitle: string;
  phone: string;
  linkedinUrl: string;
}

export default function ProfileSettingsPage() {
  const { data: session } = useSession();
  const [fields, setFields] = useState<ProfileFields>({
    name: "",
    jobTitle: "",
    phone: "",
    linkedinUrl: "",
  });
  const [original, setOriginal] = useState<ProfileFields>({
    name: "",
    jobTitle: "",
    phone: "",
    linkedinUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load session name + fetch extended profile fields
  useEffect(() => {
    if (!session?.user) return;
    const base = { name: session.user.name ?? "", jobTitle: "", phone: "", linkedinUrl: "" };
    setFields(base);
    setOriginal(base);

    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((data) => {
        const merged = {
          name: session.user.name ?? "",
          jobTitle: data.jobTitle ?? "",
          phone: data.phone ?? "",
          linkedinUrl: data.linkedinUrl ?? "",
        };
        setFields(merged);
        setOriginal(merged);
      })
      .catch(() => {/* silently ignore — name is still populated */});
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasChanges =
    fields.name !== original.name ||
    fields.jobTitle !== original.jobTitle ||
    fields.phone !== original.phone ||
    fields.linkedinUrl !== original.linkedinUrl;

  const set = (key: keyof ProfileFields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFields((f) => ({ ...f, [key]: e.target.value }));
    setError(null);
    setSaved(false);
  };

  const handleSave = async () => {
    if (!fields.name.trim()) {
      setError("Name cannot be empty.");
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      // Update name via Better Auth (keeps session cache in sync)
      if (fields.name !== original.name) {
        await authClient.updateUser({ name: fields.name.trim() });
      }

      // Update extended fields via custom route
      const extendedChanged =
        fields.jobTitle !== original.jobTitle ||
        fields.phone !== original.phone ||
        fields.linkedinUrl !== original.linkedinUrl;

      if (extendedChanged) {
        const res = await fetch("/api/user/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobTitle: fields.jobTitle,
            phone: fields.phone,
            linkedinUrl: fields.linkedinUrl,
          }),
        });
        if (!res.ok) throw new Error("Failed to save profile");
      }

      setOriginal({ ...fields });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("[Settings] Profile save error:", err);
      setError("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Profile
        </h2>
        <p className="mt-1 text-sm text-cos-slate">
          Your personal account details.
        </p>
      </div>

      <div className="space-y-3">
        <Field label="Full Name" required>
          <input
            type="text"
            value={fields.name}
            onChange={set("name")}
            placeholder="Your name"
            className={inputCls}
          />
        </Field>

        <Field label="Email">
          <input
            type="email"
            value={session?.user?.email ?? ""}
            disabled
            className={inputCls + " bg-cos-cloud text-cos-slate-dim"}
          />
          <p className="mt-1 text-xs text-cos-slate-light">
            Email cannot be changed — it&apos;s linked to your login.
          </p>
        </Field>

        <Field label="Job Title">
          <input
            type="text"
            value={fields.jobTitle}
            onChange={set("jobTitle")}
            placeholder="e.g. Managing Partner, Head of Growth"
            className={inputCls}
          />
        </Field>

        <Field label="Phone">
          <input
            type="tel"
            value={fields.phone}
            onChange={set("phone")}
            placeholder="+1 415 555 2671"
            className={inputCls}
          />
          <p className="mt-1 text-xs text-cos-slate-light">
            International format recommended (e.g. +14155552671) — used for future WhatsApp notifications.
          </p>
        </Field>

        <Field label="LinkedIn URL">
          <input
            type="url"
            value={fields.linkedinUrl}
            onChange={set("linkedinUrl")}
            placeholder="https://linkedin.com/in/yourprofile"
            className={inputCls}
          />
        </Field>
      </div>

      {error && <p className="text-xs text-cos-ember">{error}</p>}

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={handleSave} disabled={saving || !hasChanges}>
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
  );
}

const inputCls =
  "mt-1 w-full rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4">
      <label className="block text-xs font-medium text-cos-slate">
        {label}
        {required && <span className="ml-0.5 text-cos-ember">*</span>}
      </label>
      {children}
    </div>
  );
}
