"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NewCompanyPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [sizeEstimate, setSizeEstimate] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/growth-ops/crm/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          domain: domain.trim() || undefined,
          industry: industry.trim() || undefined,
          sizeEstimate: sizeEstimate || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create company");
      }
      const data = await res.json();
      router.push(`/admin/growth-ops/crm/companies/acq_${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create company");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <Link href="/admin/growth-ops/crm/companies" className="flex items-center gap-1.5 text-sm text-cos-slate hover:text-cos-electric mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Companies
      </Link>

      <h1 className="text-2xl font-heading font-bold text-cos-midnight mb-1">New Company</h1>
      <p className="text-sm text-cos-slate mb-6">Add a new prospect company to the CRM.</p>

      {error && (
        <div className="rounded-cos-lg bg-cos-ember/10 px-4 py-3 text-sm text-cos-ember mb-4">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-cos-xl border border-cos-border bg-white p-6">
        <div>
          <label className="text-xs font-medium text-cos-slate mb-1.5 block">Company Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Corp"
            className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
            autoFocus
            required
          />
        </div>

        <div>
          <label className="text-xs font-medium text-cos-slate mb-1.5 block">Domain</label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="acme.com"
            className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-cos-slate mb-1.5 block">Industry</label>
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. SaaS, FinTech, Healthcare"
              className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-cos-slate mb-1.5 block">Size</label>
            <select
              value={sizeEstimate}
              onChange={(e) => setSizeEstimate(e.target.value)}
              className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
            >
              <option value="">Unknown</option>
              <option value="1-10">1-10 employees</option>
              <option value="11-50">11-50 employees</option>
              <option value="51-200">51-200 employees</option>
              <option value="201-500">201-500 employees</option>
              <option value="501-1000">501-1000 employees</option>
              <option value="1001+">1001+ employees</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/admin/growth-ops/crm/companies" className="rounded-cos-lg border border-cos-border px-4 py-2.5 text-sm font-medium text-cos-slate hover:text-cos-midnight transition-colors">
            Cancel
          </Link>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Building2 className="mr-1.5 h-4 w-4" />}
            Create Company
          </Button>
        </div>
      </form>
    </div>
  );
}
