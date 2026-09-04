// The bar across the top of every public page.

"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Tapping any link in the small-screen menu closes it on the way out.
  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background">
      <div className="mx-auto flex h-topbar w-full max-w-content items-center justify-between gap-6 px-6">
        <Link
          href="/"
          className="rounded-md text-h3 font-semibold tracking-tight text-text-primary"
        >
          Chat<span className="text-primary">Wise</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const isCurrent = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isCurrent ? "page" : undefined}
                className={`rounded-md px-3 py-2 text-small transition-colors ${
                  isCurrent
                    ? "text-text-primary"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Get started</Link>
          </Button>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-expanded={isMenuOpen}
          aria-controls="mobile-nav"
          aria-label={isMenuOpen ? "Close menu" : "Open menu"}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          {isMenuOpen ? <X /> : <Menu />}
        </Button>
      </div>

      {isMenuOpen && (
        <div
          id="mobile-nav"
          className="border-t border-border bg-surface px-6 py-4 md:hidden"
        >
          <nav aria-label="Main" className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                aria-current={pathname === link.href ? "page" : undefined}
                className="rounded-md px-2 py-2.5 text-text-secondary hover:text-text-primary"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="mt-4 flex flex-col gap-2">
            <Button asChild variant="outline">
              <Link href="/login" onClick={closeMenu}>
                Log in
              </Link>
            </Button>
            <Button asChild>
              <Link href="/signup" onClick={closeMenu}>
                Get started
              </Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
