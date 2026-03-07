"use client";

import { Button } from "@/components/ui/button";

export default function ProfileSettingsPage() {
  return (
    <div className="space-y-6 p-6">
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
            placeholder="you@example.com"
            disabled
            className="mt-1 w-full rounded-cos-lg border border-cos-border bg-cos-cloud px-3 py-2 text-sm text-cos-slate-dim"
          />
          <p className="mt-1 text-xs text-cos-slate-light">
            Email changes are not supported yet.
          </p>
        </div>

        <Button size="sm">Save Changes</Button>
      </div>
    </div>
  );
}
