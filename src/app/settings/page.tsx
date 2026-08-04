"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function SettingsPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Profile: default User-Agent.
  const [defaultUserAgent, setDefaultUserAgent] = useState("");
  const [fallbackUserAgent, setFallbackUserAgent] = useState("");
  const [uaSaving, setUaSaving] = useState(false);
  const [uaSaved, setUaSaved] = useState(false);

  async function load() {
    const res = await fetch("/api/keys");
    if (res.ok) setKeys((await res.json()).keys);
  }
  async function loadProfile() {
    const res = await fetch("/api/profile");
    if (res.ok) {
      const data = await res.json();
      setDefaultUserAgent(data.defaultUserAgent ?? "");
      setFallbackUserAgent(data.fallbackUserAgent ?? "");
    }
  }
  useEffect(() => {
    void load();
    void loadProfile();
  }, []);

  async function saveUserAgent(e: React.FormEvent) {
    e.preventDefault();
    setUaSaving(true);
    setUaSaved(false);
    setError(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultUserAgent }),
    });
    setUaSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Failed to save");
      return;
    }
    const data = await res.json();
    setDefaultUserAgent(data.defaultUserAgent ?? "");
    setUaSaved(true);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setNewKey(null);
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to create key");
      return;
    }
    setNewKey(data.key);
    setName("");
    void load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this API key? Any integrations using it will stop working.")) return;
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    void load();
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← Back to crawls
        </Link>
        <ThemeToggle />
      </div>
      <h1 className="mb-1 mt-3 text-2xl font-bold">Settings</h1>
      <p className="mb-8 text-sm text-gray-500">Profile preferences and API keys.</p>

      <section className="mb-8 rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold">Default User-Agent</h2>
        <p className="mb-3 text-sm text-gray-500">
          Pre-fills new crawls and is used when the API omits a User-Agent. Leave blank to
          use the system default.
        </p>
        <form onSubmit={saveUserAgent} className="flex gap-2">
          <input
            type="text"
            placeholder={fallbackUserAgent || "System default"}
            value={defaultUserAgent}
            onChange={(e) => {
              setDefaultUserAgent(e.target.value);
              setUaSaved(false);
            }}
            className="flex-1 rounded border px-3 py-2 font-mono text-xs"
          />
          <button
            type="submit"
            disabled={uaSaving}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {uaSaving ? "Saving…" : "Save"}
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-400">
          {uaSaved ? (
            <span className="text-green-600">Saved.</span>
          ) : (
            <>
              System default (from <code>CRAWL_DEFAULT_USER_AGENT</code>):{" "}
              <code className="break-all">{fallbackUserAgent}</code>
            </>
          )}
        </p>
      </section>

      <section className="mb-8 rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Create API key</h2>
        {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {newKey && (
          <div className="mb-4 rounded border border-green-300 bg-green-50 p-3 text-sm">
            <p className="mb-1 font-medium text-green-800">
              Copy your new key now — it won&apos;t be shown again:
            </p>
            <code className="block break-all rounded bg-white px-2 py-1.5 font-mono text-xs">{newKey}</code>
          </div>
        )}
        <form onSubmit={create} className="flex gap-2">
          <input
            type="text"
            required
            placeholder="Key name (e.g. CI pipeline)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create key"}
          </button>
        </form>
      </section>

      <section className="rounded-lg border bg-white shadow-sm">
        <h2 className="border-b px-6 py-3 text-lg font-semibold">Your API keys</h2>
        {keys.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-500">No API keys yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-6 py-2">Name</th>
                <th className="px-6 py-2">Key</th>
                <th className="px-6 py-2">Last used</th>
                <th className="px-6 py-2">Created</th>
                <th className="px-6 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className="px-6 py-3 font-medium">{k.name}</td>
                  <td className="px-6 py-3 font-mono text-xs text-gray-500">{k.prefix}…</td>
                  <td className="px-6 py-3 text-gray-500">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "Never"}
                  </td>
                  <td className="px-6 py-3 text-gray-500">{new Date(k.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => remove(k.id)} className="text-xs text-red-600 hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-8 rounded-lg border bg-gray-50 p-6 text-sm">
        <h2 className="mb-2 font-semibold">Using the API</h2>
        <p className="mb-2 text-gray-600">Authenticate with your key, then create and poll crawls:</p>
        <pre className="overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
{`# Create a crawl
curl -X POST http://localhost:3000/api/v1/crawls \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"seedUrl":"https://example.com","maxUrls":50,
       "webhookUrl":"https://your-app.com/hooks/crawl"}'

# Fetch crawl status + issue summary
curl http://localhost:3000/api/v1/crawls/CRAWL_ID \\
  -H "Authorization: Bearer YOUR_KEY"

# Fetch result rows for a tab (internal, titles, links, …)
curl "http://localhost:3000/api/v1/crawls/CRAWL_ID/results?tab=internal&page=1" \\
  -H "Authorization: Bearer YOUR_KEY"`}
        </pre>
      </section>
    </div>
  );
}
