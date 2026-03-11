"use client";

import { useState } from "react";

export default function SetupAdminPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/setup-superadmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Something went wrong.");
      } else {
        setStatus("done");
        setMessage(data.message);
      }
    } catch (err) {
      setStatus("error");
      setMessage(String(err));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">First-time Admin Setup</h1>
        <p className="mt-2 text-sm text-gray-500">
          Enter your account email to grant yourself superadmin access.
          This page disables itself once a superadmin exists.
        </p>

        {status === "done" ? (
          <div className="mt-6 rounded-xl bg-green-50 border border-green-200 px-4 py-4">
            <p className="text-sm font-medium text-green-800">{message}</p>
            <a
              href="/admin"
              className="mt-3 inline-block rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
            >
              Go to Admin Panel →
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Your account email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {status === "error" && (
              <p className="text-sm text-red-600">{message}</p>
            )}

            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {status === "loading" ? "Setting up…" : "Make me superadmin"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
