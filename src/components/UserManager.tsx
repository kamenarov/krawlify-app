"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "member";
  disabled: boolean;
  createdAt: string;
  _count: { crawls: number };
}

const empty = { email: "", name: "", password: "", role: "member" as "admin" | "member" };

export function UserManager() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ ...empty });
  const [editing, setEditing] = useState<{ id: string; email: string; name: string; role: "admin" | "member"; password: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
      setCurrentUserId(data.currentUserId);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Failed to create user");
      return;
    }
    setCreateForm({ ...empty });
    void load();
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      email: editing.email,
      name: editing.name || null,
      role: editing.role,
    };
    if (editing.password) body.password = editing.password;
    const res = await fetch(`/api/users/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Failed to update user");
      return;
    }
    setEditing(null);
    void load();
  }

  async function toggleDisabled(u: UserRow) {
    setError(null);
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled: !u.disabled }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Failed to update user");
      return;
    }
    void load();
  }

  async function remove(u: UserRow) {
    if (
      !confirm(
        `Delete ${u.email}?\n\nThis permanently removes the account and ALL their data: ` +
          `every crawl and its results (pages, links, assets, redirects, issues) and all API keys. ` +
          `This cannot be undone.`,
      )
    )
      return;
    setError(null);
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Failed to delete user");
      return;
    }
    void load();
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <Link href="/settings" className="text-sm text-blue-600 hover:underline">
          ← Back to settings
        </Link>
        <ThemeToggle />
      </div>
      <h1 className="mb-1 mt-3 text-2xl font-bold">User management</h1>
      <p className="mb-6 text-sm text-gray-500">
        Admins can view any user&apos;s crawl data, change details, and remove accounts.
      </p>

      {error && <div className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="mb-8 rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Create user</h2>
        <form onSubmit={create} className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          <input
            type="email" required placeholder="Email" value={createForm.email}
            onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
            className="rounded border px-3 py-2 text-sm sm:col-span-2"
          />
          <input
            type="text" placeholder="Name" value={createForm.name}
            onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
            className="rounded border px-3 py-2 text-sm"
          />
          <input
            type="password" required minLength={8} placeholder="Password" value={createForm.password}
            onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
            className="rounded border px-3 py-2 text-sm"
          />
          <select
            value={createForm.role}
            onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as "admin" | "member" }))}
            className="rounded border px-3 py-2 text-sm"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="submit" disabled={busy}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:col-span-5"
          >
            {busy ? "Saving…" : "Create user"}
          </button>
        </form>
      </section>

      <section className="rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Crawls</th>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id} className="align-middle">
                <td className="px-4 py-3 font-medium">
                  {u.email}
                  {u.id === currentUserId && <span className="ml-2 text-xs text-gray-400">(you)</span>}
                </td>
                <td className="px-4 py-3 text-gray-600">{u.name ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
                    {u.role}
                  </span>
                  {u.disabled && (
                    <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      disabled
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 tabular">{u._count.crawls}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3 text-xs">
                    <Link href={`/?user=${u.id}`} className="text-blue-600 hover:underline">
                      View crawls
                    </Link>
                    <button
                      onClick={() => setEditing({ id: u.id, email: u.email, name: u.name ?? "", role: u.role, password: "" })}
                      className="text-gray-600 hover:underline"
                    >
                      Edit
                    </button>
                    {u.id !== currentUserId && (
                      <button
                        onClick={() => toggleDisabled(u)}
                        className={u.disabled ? "text-green-600 hover:underline" : "text-amber-600 hover:underline"}
                      >
                        {u.disabled ? "Enable" : "Disable"}
                      </button>
                    )}
                    {u.id !== currentUserId && (
                      <button onClick={() => remove(u)} className="text-red-600 hover:underline">
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {editing && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" onClick={() => setEditing(null)}>
          <form
            onSubmit={saveEdit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3 rounded-lg bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold">Edit user</h2>
            <label className="block text-sm">
              Email
              <input
                type="email" required value={editing.email}
                onChange={(e) => setEditing((s) => s && { ...s, email: e.target.value })}
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              Name
              <input
                type="text" value={editing.name}
                onChange={(e) => setEditing((s) => s && { ...s, name: e.target.value })}
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              Role
              <select
                value={editing.role}
                onChange={(e) => setEditing((s) => s && { ...s, role: e.target.value as "admin" | "member" })}
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="block text-sm">
              New password <span className="text-gray-400">(leave blank to keep)</span>
              <input
                type="password" minLength={8} value={editing.password}
                onChange={(e) => setEditing((s) => s && { ...s, password: e.target.value })}
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(null)} className="rounded border px-4 py-2 text-sm">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
