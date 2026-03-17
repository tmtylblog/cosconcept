"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Users,
  ArrowLeft,
  Linkedin,
  Mail,
  Loader2,
  Briefcase,
  MessageSquare,
  TrendingUp,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface PersonDetail {
  id: string;
  fullName: string;
  email: string | null;
  title: string | null;
  headline: string | null;
  linkedinUrl: string | null;
  photoUrl: string | null;
  location: string | null;
  entityClass: string;
  companyName: string | null;
  companyDomain: string | null;
  firmId: string | null;
}

const ENTITY_BADGE: Record<string, { label: string; className: string }> = {
  expert: { label: "Expert", className: "bg-green-100 text-green-700" },
  prospect_contact: { label: "Prospect", className: "bg-blue-100 text-blue-700" },
  platform_user: { label: "Platform User", className: "bg-purple-100 text-purple-700" },
  legacy_contact: { label: "Legacy Contact", className: "bg-gray-100 text-gray-600" },
};

type Tab = "profile" | "activity" | "deals" | "messages";

export default function PersonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/growth-ops/crm/people/${encodeURIComponent(id as string)}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setPerson)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-cos-slate">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading person...
      </div>
    );
  }

  if (!person) {
    return (
      <div className="text-center py-24">
        <p className="text-cos-slate mb-4">Person not found.</p>
        <Button variant="outline" onClick={() => router.push("/admin/growth-ops/crm/people")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to People
        </Button>
      </div>
    );
  }

  const badge = ENTITY_BADGE[person.entityClass] || ENTITY_BADGE.legacy_contact;

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "profile", label: "Profile", icon: Briefcase },
    { key: "activity", label: "Activity", icon: Clock },
    { key: "deals", label: "Deals", icon: TrendingUp },
    { key: "messages", label: "Messages", icon: MessageSquare },
  ];

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.push("/admin/growth-ops/crm/people")}
        className="flex items-center gap-1 text-sm text-cos-slate hover:text-cos-electric transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to People
      </button>

      {/* Person Header */}
      <div className="rounded-cos-lg border border-cos-border bg-cos-surface p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            {person.photoUrl ? (
              <img src={person.photoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <div className="h-14 w-14 rounded-full bg-cos-electric/10 flex items-center justify-center text-lg font-bold text-cos-electric">
                {person.fullName.charAt(0)}
              </div>
            )}
            <div>
              <h1 className="text-xl font-heading font-bold text-cos-midnight">{person.fullName}</h1>
              {person.title && (
                <p className="text-sm text-cos-slate mt-0.5">{person.title}</p>
              )}
              {person.headline && !person.title && (
                <p className="text-sm text-cos-slate mt-0.5">{person.headline}</p>
              )}
              <div className="flex items-center gap-3 mt-1 text-xs text-cos-slate-light">
                {person.companyName && <span>{person.companyName}</span>}
                {person.companyDomain && <span>&middot; {person.companyDomain}</span>}
                {person.location && <span>&middot; {person.location}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}>
              {badge.label}
            </span>
            {person.email && (
              <Button variant="outline" size="sm" onClick={() => window.open(`mailto:${person.email}`)}>
                <Mail className="h-4 w-4 mr-1" /> Email
              </Button>
            )}
            {person.linkedinUrl && (
              <Button variant="outline" size="sm" onClick={() => window.open(person.linkedinUrl!, "_blank")}>
                <Linkedin className="h-4 w-4 mr-1" /> LinkedIn
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-cos-border">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-cos-electric text-cos-electric"
                  : "border-transparent text-cos-slate hover:text-cos-midnight"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="rounded-cos-lg border border-cos-border bg-cos-surface p-6 min-h-[300px]">
        {activeTab === "profile" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {person.email && (
                <div>
                  <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Email</h3>
                  <p className="text-sm text-cos-midnight">{person.email}</p>
                </div>
              )}
              {person.linkedinUrl && (
                <div>
                  <h3 className="text-sm font-medium text-cos-slate-dim mb-1">LinkedIn</h3>
                  <a href={person.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-cos-electric hover:underline">
                    {person.linkedinUrl.replace("https://www.linkedin.com/in/", "").replace(/\/$/, "")}
                  </a>
                </div>
              )}
              {person.firmId && (
                <div>
                  <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Firm</h3>
                  <p className="text-sm text-cos-midnight">{person.firmId}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "activity" && (
          <div className="text-center py-12 text-cos-slate-light text-sm">
            Activity timeline — coming in Phase 2. Will show prospect timeline and deal activities.
          </div>
        )}

        {activeTab === "deals" && (
          <div className="text-center py-12 text-cos-slate-light text-sm">
            Deals tab — coming in Phase 2. Will show pipeline deals for this contact.
          </div>
        )}

        {activeTab === "messages" && (
          <div className="text-center py-12 text-cos-slate-light text-sm">
            Messages tab — coming in Phase 2. Will show LinkedIn conversations with this person.
          </div>
        )}
      </div>
    </div>
  );
}
