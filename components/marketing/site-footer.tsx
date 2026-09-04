// The foot of every public page.

import Link from "next/link";

const FOOTER_SECTIONS = [
  {
    heading: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    heading: "Get started",
    links: [
      { href: "/signup", label: "Create an account" },
      { href: "/login", label: "Log in" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-content px-6 py-12">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <Link
              href="/"
              className="rounded-md text-h3 font-semibold text-text-primary"
            >
              Chat<span className="text-primary">Wise</span>
            </Link>
            <p className="mt-3 text-small text-text-secondary">
              A ready-made AI agent on your own WhatsApp number, and one place to
              manage every conversation it handles.
            </p>
          </div>

          <div className="flex gap-12 sm:gap-16">
            {FOOTER_SECTIONS.map((section) => (
              <div key={section.heading}>
                <h2 className="text-small font-medium text-text-primary">
                  {section.heading}
                </h2>
                <ul className="mt-3 space-y-2">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="rounded-md text-small text-text-secondary transition-colors hover:text-text-primary"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <p className="text-small text-text-secondary">
            © {new Date().getFullYear()} ChatWise. Not affiliated with or endorsed
            by WhatsApp or Meta.
          </p>
        </div>
      </div>
    </footer>
  );
}
