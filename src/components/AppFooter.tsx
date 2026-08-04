"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Logo";
import { PRODUCT_TAGLINE } from "@/lib/brand";

/**
 * App-wide footer shown only when the user is logged in. Hidden on the immersive crawl
 * dashboard (`/crawls/<id>/…`), which is its own full-screen workspace, but shown on
 * `/crawls/new` and the other content pages. Links to the API docs, MCP guide and playground.
 */
export function AppFooter() {
  const { status } = useSession();
  const pathname = usePathname() ?? "";

  if (status !== "authenticated") return null;

  const onDashboard = /^\/crawls\/[^/]+(\/|$)/.test(pathname) && !pathname.startsWith("/crawls/new");
  if (onDashboard) return null;

  return (
    <footer className="border-t bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4 text-sm text-gray-500">
        <Wordmark size={20} tagline={PRODUCT_TAGLINE} />
        <nav className="flex gap-4">
          <Link href="/" className="hover:text-gray-800">
            Crawls
          </Link>
          <Link href="/settings" className="hover:text-gray-800">
            Settings
          </Link>
          <Link href="/docs/api" className="font-medium text-blue-600 hover:underline">
            API Documentation
          </Link>
          <Link href="/docs/mcp" className="font-medium text-blue-600 hover:underline">
            MCP Server
          </Link>
          <Link href="/playground" className="font-medium text-blue-600 hover:underline">
            API Playground
          </Link>
        </nav>
      </div>
    </footer>
  );
}
