"use client";

import { useEffect, useState } from "react";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  members: number;
  createdAt: string;
}

export default function AdminOrganizationsPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/organizations")
      .then((r) => r.json())
      .then((data) => setOrgs(data.organizations ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-sm text-cos-slate">Loading organizations...</div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold text-cos-midnight">
        Organizations
      </h1>

      <div className="overflow-x-auto rounded-cos-xl border border-cos-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-cos-border bg-cos-surface">
            <tr>
              <th className="px-4 py-3 font-medium text-cos-slate">Name</th>
              <th className="px-4 py-3 font-medium text-cos-slate">Slug</th>
              <th className="px-4 py-3 font-medium text-cos-slate">Plan</th>
              <th className="px-4 py-3 font-medium text-cos-slate">Status</th>
              <th className="px-4 py-3 font-medium text-cos-slate">Members</th>
              <th className="px-4 py-3 font-medium text-cos-slate">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cos-border">
            {orgs.map((org) => (
              <tr key={org.id} className="hover:bg-cos-electric/5">
                <td className="px-4 py-3 font-medium text-cos-midnight">
                  {org.name}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-cos-slate">
                  {org.slug}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-cos-pill px-2 py-0.5 text-xs font-medium ${
                      org.plan === "enterprise"
                        ? "bg-cos-electric/10 text-cos-electric"
                        : org.plan === "pro"
                          ? "bg-cos-signal/10 text-cos-signal"
                          : "bg-cos-slate/10 text-cos-slate"
                    }`}
                  >
                    {org.plan}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-cos-slate">
                  {org.status}
                </td>
                <td className="px-4 py-3 text-cos-midnight">{org.members}</td>
                <td className="px-4 py-3 text-cos-slate">{org.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
