"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NewPersonPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyDomain, setCompanyDomain] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/growth-ops/crm/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          linkedinUrl: linkedinUrl.trim() || undefined,
          companyName: companyName.trim() || undefined,
          companyDomain: companyDomain.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create contact");
      }
      const data = await res.json();
      router.push(`/admin/growth-ops/crm/people/ac_${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create contact");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <Link href="/admin/growth-ops/crm/people" className="flex items-center gap-1.5 text-sm text-cos-slate hover:text-cos-electric mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to People
      </Link>

      <h1 className="text-2xl font-heading font-bold text-cos-midnight mb-1">New Person</h1>
      <p className="text-sm text-cos-slate mb-6">Add a new contact to the CRM.</p>

      {error && (
        <div className="rounded-cos-lg bg-cos-ember/10 px-4 py-3 text-sm text-cos-ember mb-4">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-cos-xl border border-cos-border bg-white p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-cos-slate mb-1.5 block">First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jane"
              className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-cos-slate mb-1.5 block">Last Name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Smith"
              className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-cos-slate mb-1.5 block">Email *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@acme.com"
            className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
            required
          />
        </div>

        <div>
          <label className="text-xs font-medium text-cos-slate mb-1.5 block">LinkedIn URL</label>
          <input
            type="url"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            placeholder="https://linkedin.com/in/janesmith"
            className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
          />
        </div>

        <hr className="border-cos-border" />
        <p className="text-xs font-medium text-cos-slate-dim uppercase tracking-wider">Company (optional)</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-cos-slate mb-1.5 block">Company Name</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Corp"
              className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-cos-slate mb-1.5 block">Company Domain</label>
            <input
              type="text"
              value={companyDomain}
              onChange={(e) => setCompanyDomain(e.target.value)}
              placeholder="acme.com"
              className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/admin/growth-ops/crm/people" className="rounded-cos-lg border border-cos-border px-4 py-2.5 text-sm font-medium text-cos-slate hover:text-cos-midnight transition-colors">
            Cancel
          </Link>
          <Button type="submit" disabled={saving || !email.trim()}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <UserPlus className="mr-1.5 h-4 w-4" />}
            Create Person
          </Button>
        </div>
      </form>
    </div>
  );
}
