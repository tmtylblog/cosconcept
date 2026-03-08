"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Building2,
  Search,
  Globe,
  MapPin,
  ChevronDown,
  ChevronRight,
  Briefcase,
  FileText,
  ExternalLink,
  Loader2,
} from "lucide-react";
import type { ImportedClient } from "@/components/admin/types";

interface AssociationItem {
  id: string;
  name?: string;
  title?: string;
  summary?: string;
  website?: string;
  email?: string;
}

export default function ClientsTab() {
  const [clients, setClients] = useState<ImportedClient[]>([]);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const limit = 50;

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search) params.set("q", search);

      const res = await fetch(`/api/admin/clients?${params}`);
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients ?? []);
        setTotal(data.total ?? 0);
      }
    } catch (err) {
      console.error("Failed to load clients:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cos-slate" />
          <input
            type="text"
            placeholder="Search clients by name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-cos-xl border border-cos-border bg-cos-surface py-3 pl-11 pr-4 text-sm text-cos-midnight placeholder:text-cos-slate-light transition-colors focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
          />
        </div>
        <button
          type="submit"
          className="rounded-cos-xl bg-cos-electric px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-cos-electric-hover"
        >
          Search
        </button>
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSearchInput("");
            }}
            className="rounded-cos-xl border border-cos-border px-4 py-3 text-sm text-cos-slate transition-colors hover:bg-cos-cloud"
          >
            Clear
          </button>
        )}
      </form>

      {/* Stats bar */}
      <div className="flex items-center justify-between text-xs text-cos-slate">
        <span>
          {loading
            ? "Loading..."
            : `${total.toLocaleString()} client${total !== 1 ? "s" : ""} found`}
          {search && (
            <span className="ml-1.5 rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-cos-electric">
              &quot;{search}&quot;
            </span>
          )}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-cos-electric/30 disabled:opacity-30"
            >
              Prev
            </button>
            <span className="font-mono text-xs">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-cos-electric/30 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Client list */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
          </div>
        ) : clients.length === 0 ? (
          <div className="rounded-cos-xl border border-dashed border-cos-border py-16 text-center">
            <Building2 className="mx-auto h-10 w-10 text-cos-slate-light mb-3" />
            <p className="text-sm font-medium text-cos-midnight">No client companies found</p>
            <p className="mt-1 text-xs text-cos-slate max-w-sm mx-auto">
              Client companies are populated from case studies and work history in the knowledge
              graph.
            </p>
          </div>
        ) : (
          clients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              expanded={expandedClient === client.id}
              onToggle={() =>
                setExpandedClient(expandedClient === client.id ? null : client.id)
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

/* -- Client Card --------------------------------------------------------- */

function ClientCard({
  client,
  expanded,
  onToggle,
}: {
  client: ImportedClient;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasAssociations = client.serviceFirmCount > 0 || client.caseStudyCount > 0;

  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-cos-electric/5"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-cos-lg bg-purple-100">
          <Building2 className="h-4 w-4 text-purple-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-cos-midnight">{client.name}</p>
          <div className="flex items-center gap-3">
            {client.industry && (
              <p className="text-xs text-cos-slate-light">{client.industry}</p>
            )}
            {client.website && (
              <p className="flex items-center gap-1 text-xs text-cos-slate-light">
                <Globe className="h-3 w-3" />
                {client.website}
              </p>
            )}
            {client.location && (
              <p className="flex items-center gap-1 text-xs text-cos-slate-light">
                <MapPin className="h-3 w-3" />
                {client.location}
              </p>
            )}
          </div>
        </div>

        {/* Association count badges */}
        <div className="flex items-center gap-3 text-xs">
          {client.serviceFirmCount > 0 && (
            <span className="flex items-center gap-1 text-cos-electric">
              <Briefcase className="h-3 w-3" />
              {client.serviceFirmCount}
            </span>
          )}
          {client.caseStudyCount > 0 && (
            <span className="flex items-center gap-1 text-cos-warm">
              <FileText className="h-3 w-3" />
              {client.caseStudyCount}
            </span>
          )}
        </div>

        {hasAssociations ? (
          expanded ? (
            <ChevronDown className="h-4 w-4 text-cos-slate" />
          ) : (
            <ChevronRight className="h-4 w-4 text-cos-slate" />
          )
        ) : (
          <div className="w-4" />
        )}
      </button>

      {expanded && hasAssociations && (
        <div className="border-t border-cos-border p-4 space-y-3">
          {client.serviceFirmCount > 0 && (
            <AssociationSection
              nodeId={client.id}
              nodeType="Company"
              assocType="firms"
              label="Associated Service Firms"
              count={client.serviceFirmCount}
              icon={<Briefcase className="h-3.5 w-3.5 text-cos-electric" />}
              renderItem={(item) => (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-cos-midnight">{item.name}</span>
                  {item.website && (
                    <a
                      href={
                        item.website.startsWith("http") ? item.website : `https://${item.website}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-cos-electric hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3 w-3" />
                      {item.website}
                    </a>
                  )}
                </div>
              )}
            />
          )}

          {client.caseStudyCount > 0 && (
            <AssociationSection
              nodeId={client.id}
              nodeType="Company"
              assocType="caseStudies"
              label="Associated Case Studies"
              count={client.caseStudyCount}
              icon={<FileText className="h-3.5 w-3.5 text-cos-warm" />}
              renderItem={(item) => (
                <div>
                  <p className="text-sm text-cos-midnight">{item.title}</p>
                  {item.summary && (
                    <p className="mt-0.5 text-xs text-cos-slate line-clamp-2">{item.summary}</p>
                  )}
                </div>
              )}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* -- Association Section -------------------------------------------------- */

function AssociationSection({
  nodeId,
  nodeType,
  assocType,
  label,
  count,
  icon,
  renderItem,
}: {
  nodeId: string;
  nodeType: string;
  assocType: string;
  label: string;
  count: number;
  icon: React.ReactNode;
  renderItem: (item: AssociationItem) => React.ReactNode;
}) {
  const [items, setItems] = useState<AssociationItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function loadItems() {
    if (items) {
      setOpen(!open);
      return;
    }
    setLoading(true);
    setOpen(true);
    try {
      const params = new URLSearchParams({ nodeId, nodeType, assocType });
      const res = await fetch(`/api/admin/graph/associations?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
      }
    } catch (err) {
      console.error("Failed to load associations:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={loadItems}
        className="flex items-center gap-2 text-sm font-medium text-cos-midnight hover:text-cos-electric transition-colors"
      >
        {icon}
        <span>{label}</span>
        <span className="rounded-cos-pill bg-cos-slate/10 px-1.5 py-0.5 text-[10px] font-medium text-cos-slate">
          {count}
        </span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-cos-slate" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-cos-slate" />
        )}
      </button>

      {open && (
        <div className="mt-2 ml-5 space-y-1.5">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-cos-slate">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading...
            </div>
          ) : items && items.length > 0 ? (
            items.map((item) => (
              <div key={item.id} className="rounded-cos-md bg-cos-cloud px-3 py-2">
                {renderItem(item)}
              </div>
            ))
          ) : (
            <p className="text-xs text-cos-slate-light">None found.</p>
          )}
        </div>
      )}
    </div>
  );
}
