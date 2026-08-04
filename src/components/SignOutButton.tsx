"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded border px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
    >
      Sign out
    </button>
  );
}
