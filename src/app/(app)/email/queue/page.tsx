"use client";

/**
 * Email Approval Queue Page
 *
 * Shows emails that Ossy has drafted and need user approval before sending.
 * Users can preview, edit, approve, or reject emails.
 */

import { useState, useEffect, useCallback } from "react";
import { useActiveOrganization } from "@/lib/auth-client";
import {
  Mail,
  Check,
  X,
  Eye,
  Clock,
  Send,
  AlertCircle,
  Inbox,
} from "lucide-react";

interface QueuedEmail {
  id: string;
  emailType: string;
  toEmails: string[];
  ccEmails?: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  context?: {
    partnershipId?: string;
    opportunityId?: string;
    reason?: string;
  };
  status: string;
  createdAt: string;
}

export default function EmailQueuePage() {
  const { data: org } = useActiveOrganization();
  const [emails, setEmails] = useState<QueuedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<QueuedEmail | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  const firmId = org?.id;

  const fetchQueue = useCallback(async () => {
    if (!firmId) return;
    try {
      const res = await fetch(`/api/email/queue?firmId=${firmId}`);
      const data = await res.json();
      setEmails(data.emails ?? []);
    } catch {
      console.error("Failed to fetch email queue");
    } finally {
      setLoading(false);
    }
  }, [firmId]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  async function handleAction(emailId: string, action: "approve" | "reject") {
    setProcessing(emailId);
    try {
      const res = await fetch("/api/email/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId, action }),
      });

      if (res.ok) {
        setEmails((prev) => prev.filter((e) => e.id !== emailId));
        if (selectedEmail?.id === emailId) setSelectedEmail(null);
      }
    } catch {
      console.error("Failed to process email");
    } finally {
      setProcessing(null);
    }
  }

  const typeLabels: Record<string, string> = {
    intro: "Partnership Introduction",
    follow_up: "Follow-up Reminder",
    opportunity_share: "Opportunity Share",
    digest: "Weekly Digest",
  };

  const typeColors: Record<string, string> = {
    intro: "bg-indigo-100 text-indigo-700",
    follow_up: "bg-amber-100 text-amber-700",
    opportunity_share: "bg-emerald-100 text-emerald-700",
    digest: "bg-blue-100 text-blue-700",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Mail className="h-6 w-6 text-indigo-600" />
          Email Approval Queue
        </h1>
        <p className="text-gray-500 mt-1">
          Review emails Ossy wants to send on your behalf
        </p>
      </div>

      {emails.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl">
          <Inbox className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600">Queue is empty</h3>
          <p className="text-gray-400 mt-1">
            No emails waiting for approval
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Email List */}
          <div className="space-y-3">
            {emails.map((email) => (
              <div
                key={email.id}
                className={`bg-white border rounded-lg p-4 cursor-pointer transition-all ${
                  selectedEmail?.id === email.id
                    ? "border-indigo-500 ring-2 ring-indigo-200"
                    : "border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => setSelectedEmail(email)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          typeColors[email.emailType] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {typeLabels[email.emailType] ?? email.emailType}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-900 truncate">
                      {email.subject}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      To: {email.toEmails.join(", ")}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-gray-400 mt-2">
                      <Clock className="h-3 w-3" />
                      {new Date(email.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="flex gap-1 ml-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction(email.id, "approve");
                      }}
                      disabled={processing === email.id}
                      className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                      title="Approve & Send"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction(email.id, "reject");
                      }}
                      disabled={processing === email.id}
                      className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                      title="Reject"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Email Preview */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {selectedEmail ? (
              <div>
                <div className="p-4 border-b border-gray-100 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900">
                      {selectedEmail.subject}
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          handleAction(selectedEmail.id, "approve")
                        }
                        disabled={processing === selectedEmail.id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 transition-colors"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Approve & Send
                      </button>
                      <button
                        onClick={() =>
                          handleAction(selectedEmail.id, "reject")
                        }
                        disabled={processing === selectedEmail.id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-gray-500">
                    <p>To: {selectedEmail.toEmails.join(", ")}</p>
                    {selectedEmail.ccEmails && selectedEmail.ccEmails.length > 0 && (
                      <p>CC: {selectedEmail.ccEmails.join(", ")}</p>
                    )}
                  </div>
                  {selectedEmail.context?.reason && (
                    <div className="mt-2 flex items-start gap-1 text-xs text-gray-400">
                      <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      {selectedEmail.context.reason}
                    </div>
                  )}
                </div>
                <div
                  className="p-4 prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: selectedEmail.bodyHtml,
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-400">
                <div className="text-center">
                  <Eye className="h-8 w-8 mx-auto mb-2" />
                  <p>Select an email to preview</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
