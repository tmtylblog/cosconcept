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
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyDomain, setCompanyDomain] = useState("");
  const [notes, setNotes] = useState("");

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
          title: title.trim() || undefined,
          phone: phone.trim() || undefined,
          location: location.trim() || undefined,
          linkedinUrl: linkedinUrl.trim() || undefined,
          companyName: companyName.trim() || undefined,
          companyDomain: companyDomain.trim() || undefined,
          notes: notes.trim() || undefined,
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

  const inputClass = "w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none";

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
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" className={inputClass} autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium text-cos-slate mb-1.5 block">Last Name</label>
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" className={inputClass} />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-cos-slate mb-1.5 block">Email *</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@acme.com" className={inputClass} required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-cos-slate mb-1.5 block">Title / Role</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VP of Marketing" className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-medium text-cos-slate mb-1.5 block">Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555-123-4567" className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-cos-slate mb-1.5 block">Location</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="New York, NY" className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-medium text-cos-slate mb-1.5 block">LinkedIn URL</label>
            <input type="url" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/janesmith" className={inputClass} />
          </div>
        </div>

        <hr className="border-cos-border" />
        <p className="text-xs font-medium text-cos-slate-dim uppercase tracking-wider">Company (optional)</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-cos-slate mb-1.5 block">Company Name</label>
            <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Corp" className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-medium text-cos-slate mb-1.5 block">Company Domain</label>
            <input type="text" value={companyDomain} onChange={(e) => setCompanyDomain(e.target.value)} placeholder="acme.com" className={inputClass} />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-cos-slate mb-1.5 block">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Internal notes about this contact..." className={`${inputClass} resize-none`} />
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
