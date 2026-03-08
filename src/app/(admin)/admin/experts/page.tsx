"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  MapPin,
  Building2,
  Loader2,
  Mail,
  UserCheck,
  Users as UsersIcon,
  HelpCircle,
} from "lucide-react";

interface ExpertContact {
  id: string;
  sourceId: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  email: string | null;
  title: string | null;
  expertClassification: string | null;
  photoUrl: string | null;
  linkedinUrl: string | null;
  headline: string | null;
  shortBio: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  isPartner: boolean | null;
  isIcp: boolean | null;
  reviewTags: string[];
  createdAt: string;
  company: {
    id: string;
    name: string;
    domain: string | null;
  } | null;
}

type ClassificationFilter = "all" | "expert" | "internal" | "ambiguous";

const CLASSIFICATION_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  expert: { bg: "bg-cos-signal/10", text: "text-cos-signal", label: "Expert" },
  internal: { bg: "bg-cos-slate/10", text: "text-cos-slate", label: "Internal" },
  ambiguous: { bg: "bg-cos-warm/10", text: "text-cos-warm", label: "Ambiguous" },
};

export default function AdminExpertsPage() {
  const [contacts, setContacts] = useState<ExpertContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchSubmitted, setSearchSubmitted] = useState("");
  const [classification, setClassification] = useState<ClassificationFilter>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ expert: 0, internal: 0, ambiguous: 0, total: 0 });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const limit = 50;

  const fetchExperts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchSubmitted) params.set("q", searchSubmitted);
      if (classification !== "all") params.set("classification", classification);
      params.set("page", String(page));
      params.set("limit", String(limit));

      const res = await fetch(`/api/admin/experts?${params}`);
      const data = await res.json();

      setContacts(data.contacts || []);
      setTotal(data.total || 0);
      if (data.counts) setCounts(data.counts);
    } catch (err) {
      console.error("Failed to fetch experts:", err);
    } finally {
      setLoading(false);
    }
  }, [searchSubmitted, classification, page]);

  useEffect(() => {
    fetchExperts();
  }, [fetchExperts]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchSubmitted(search);
    setPage(1);
  }

  function handleClassificationChange(c: ClassificationFilter) {
    setClassification(c);
    setPage(1);
    setExpandedId(null);
  }

  const totalPages = Math.ceil(total / limit);

  const filterTabs: { key: ClassificationFilter; label: string; count: number; icon: React.ReactNode }[] = [
    { key: "all", label: "All", count: counts.total, icon: <UsersIcon className="h-3.5 w-3.5" /> },
    { key: "expert", label: "Experts", count: counts.expert, icon: <UserCheck className="h-3.5 w-3.5" /> },
    { key: "internal", label: "Internal", count: counts.internal, icon: <Building2 className="h-3.5 w-3.5" /> },
    { key: "ambiguous", label: "Ambiguous", count: counts.ambiguous, icon: <HelpCircle className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
          Experts & Contacts
        </h1>
        <p className="mt-1 text-sm text-cos-slate">
          {counts.total.toLocaleString()} imported contacts across all classifications.
        </p>
      </div>

      {/* Classification tabs */}
      <div className="flex gap-2">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleClassificationChange(tab.key)}
            className={`flex items-center gap-2 rounded-cos-lg px-4 py-2 text-sm font-medium transition-all ${
              classification === tab.key
                ? "bg-cos-electric text-white shadow-sm"
                : "bg-cos-surface text-cos-slate border border-cos-border hover:border-cos-electric/30 hover:text-cos-electric"
            }`}
          >
            {tab.icon}
            {tab.label}
            <span
              className={`rounded-cos-pill px-2 py-0.5 text-xs ${
                classification === tab.key
                  ? "bg-white/20 text-white"
                  : "bg-cos-cloud text-cos-slate"
              }`}
            >
              {tab.count.toLocaleString()}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cos-slate" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, title, or company..."
          className="w-full rounded-cos-xl border border-cos-border bg-cos-surface py-3 pl-11 pr-4 text-sm text-cos-midnight placeholder:text-cos-slate-light transition-colors focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
        />
        {searchSubmitted && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSearchSubmitted("");
              setPage(1);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-cos-pill bg-cos-electric/10 px-2.5 py-0.5 text-xs font-medium text-cos-electric hover:bg-cos-electric/20"
          >
            {total} result{total !== 1 ? "s" : ""} ✕
          </button>
        )}
      </form>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
        </div>
      ) : (
        <>
          {/* Stats bar */}
          <div className="flex items-center justify-between text-xs text-cos-slate">
            <span>
              Showing {((page - 1) * limit + 1).toLocaleString()}–
              {Math.min(page * limit, total).toLocaleString()} of{" "}
              {total.toLocaleString()}
            </span>
            {totalPages > 1 && (
              <span>
                Page {page} of {totalPages}
              </span>
            )}
          </div>

          {/* Contact cards */}
          <div className="space-y-2">
            {contacts.map((contact) => {
              const isExpanded = expandedId === contact.id;
              const classification =
                CLASSIFICATION_COLORS[contact.expertClassification || "ambiguous"] ||
                CLASSIFICATION_COLORS.ambiguous;
              const location = [contact.city, contact.state, contact.country]
                .filter(Boolean)
                .join(", ");

              return (
                <div
                  key={contact.id}
                  className="rounded-cos-xl border border-cos-border bg-cos-surface overflow-hidden transition-all hover:border-cos-electric/20"
                >
                  {/* Collapsed row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : contact.id)}
                    className="w-full flex items-center gap-4 px-5 py-3.5 text-left"
                  >
                    {/* Avatar */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-cos-full bg-gradient-to-br from-cos-electric/20 to-cos-signal/20 text-sm font-semibold text-cos-electric">
                      {contact.name?.charAt(0)?.toUpperCase() ||
                        contact.firstName?.charAt(0)?.toUpperCase() ||
                        "?"}
                    </div>

                    {/* Name & title */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-cos-midnight truncate">
                          {contact.name || `${contact.firstName} ${contact.lastName}`}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-cos-pill px-2 py-0.5 text-[10px] font-semibold ${classification.bg} ${classification.text}`}
                        >
                          {classification.label}
                        </span>
                        {contact.isPartner && (
                          <span className="inline-flex items-center rounded-cos-pill px-2 py-0.5 text-[10px] font-semibold bg-cos-electric/10 text-cos-electric">
                            Partner
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-cos-slate">
                        {contact.title && (
                          <span className="truncate max-w-[200px]">{contact.title}</span>
                        )}
                        {contact.company && (
                          <span className="flex items-center gap-1 text-cos-electric">
                            <Building2 className="h-3 w-3" />
                            {contact.company.name}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Location */}
                    {location && (
                      <div className="hidden md:flex items-center gap-1 text-xs text-cos-slate shrink-0">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate max-w-[150px]">{location}</span>
                      </div>
                    )}

                    {/* Chevron */}
                    <div className="shrink-0 text-cos-slate">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-cos-border px-5 py-4 bg-cos-cloud/30">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left column: profile info */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                            Profile
                          </h4>

                          {contact.headline && (
                            <p className="text-sm text-cos-midnight">{contact.headline}</p>
                          )}
                          {contact.shortBio && (
                            <p className="text-sm text-cos-slate leading-relaxed">
                              {contact.shortBio}
                            </p>
                          )}

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {contact.email && (
                              <div className="flex items-center gap-1.5 text-cos-slate">
                                <Mail className="h-3 w-3" />
                                <span className="font-mono">{contact.email}</span>
                              </div>
                            )}
                            {location && (
                              <div className="flex items-center gap-1.5 text-cos-slate">
                                <MapPin className="h-3 w-3" />
                                {location}
                              </div>
                            )}
                          </div>

                          {/* Action links */}
                          <div className="flex items-center gap-3 pt-2">
                            {contact.linkedinUrl && (
                              <a
                                href={contact.linkedinUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-cos-md bg-cos-electric/10 px-3 py-1.5 text-xs font-medium text-cos-electric hover:bg-cos-electric/20 transition-colors"
                              >
                                <ExternalLink className="h-3 w-3" />
                                LinkedIn
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Right column: company & metadata */}
                        <div className="space-y-3">
                          {contact.company && (
                            <>
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                                Company
                              </h4>
                              <div className="rounded-cos-lg border border-cos-border bg-cos-surface p-3">
                                <p className="font-medium text-sm text-cos-midnight">
                                  {contact.company.name}
                                </p>
                                {contact.company.domain && (
                                  <p className="text-xs text-cos-slate mt-0.5 font-mono">
                                    {contact.company.domain}
                                  </p>
                                )}
                              </div>
                            </>
                          )}

                          <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                            Metadata
                          </h4>
                          <div className="space-y-1 text-xs text-cos-slate">
                            <p>
                              <span className="font-medium">Source ID:</span>{" "}
                              <span className="font-mono">{contact.sourceId}</span>
                            </p>
                            <p>
                              <span className="font-medium">Classification:</span>{" "}
                              {contact.expertClassification || "unknown"}
                            </p>
                            <p>
                              <span className="font-medium">Imported:</span>{" "}
                              {new Date(contact.createdAt).toLocaleDateString()}
                            </p>
                          </div>

                          {contact.reviewTags && contact.reviewTags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {contact.reviewTags.map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-cos-pill bg-cos-warm/10 px-2 py-0.5 text-[10px] font-medium text-cos-warm"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {contacts.length === 0 && (
              <div className="rounded-cos-xl border border-cos-border bg-cos-surface px-5 py-12 text-center text-sm text-cos-slate">
                {searchSubmitted
                  ? "No contacts match your search."
                  : "No contacts found."}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-cos-md border border-cos-border px-4 py-2 text-sm font-medium text-cos-slate transition-colors hover:border-cos-electric hover:text-cos-electric disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-cos-slate">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-cos-md border border-cos-border px-4 py-2 text-sm font-medium text-cos-slate transition-colors hover:border-cos-electric hover:text-cos-electric disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
