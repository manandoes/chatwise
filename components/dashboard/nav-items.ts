// The dashboard's navigation, in the order it appears in the sidebar.
//
// Plain data with no database import, so both the sidebar (which runs in the
// browser) and any server code can read it.
//
// Note "My bot" is singular and there is no "add" entry anywhere. An account
// runs exactly one agent (docs/PRD.md §3.1), and the navigation should never
// imply otherwise (docs/Rules.md §6).

export type NavItem = {
  href: string;
  label: string;
  /** Lucide icon name, resolved in components/dashboard/nav-icon.tsx. */
  icon: string;
  /** Shown until the feature is built, so nothing looks broken. */
  comingSoon?: boolean;
};

export type NavGroup = {
  heading: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Overview",
    items: [
      { href: "/dashboard", label: "Overview", icon: "LayoutDashboard" },
      { href: "/dashboard/my-bot", label: "My bot", icon: "Bot" },
      {
        href: "/dashboard/connect-whatsapp",
        label: "Connect WhatsApp",
        icon: "Smartphone",
        comingSoon: true,
      },
    ],
  },
  {
    heading: "Day to day",
    items: [
      {
        href: "/dashboard/conversations",
        label: "Conversations",
        icon: "MessagesSquare",
        comingSoon: true,
      },
      { href: "/dashboard/leads", label: "Leads", icon: "Users", comingSoon: true },
      {
        href: "/dashboard/knowledge-base",
        label: "Knowledge base",
        icon: "BookOpen",
        comingSoon: true,
      },
      {
        href: "/dashboard/campaigns",
        label: "Campaigns",
        icon: "Megaphone",
        comingSoon: true,
      },
    ],
  },
  {
    heading: "Account",
    items: [
      {
        href: "/dashboard/analytics",
        label: "Analytics",
        icon: "BarChart3",
        comingSoon: true,
      },
      {
        href: "/dashboard/billing",
        label: "Billing",
        icon: "CreditCard",
        comingSoon: true,
      },
      { href: "/dashboard/settings", label: "Settings", icon: "Settings" },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** The nav entry matching a path, used for page titles and the mobile header. */
export function navItemForPath(pathname: string): NavItem | undefined {
  // Longest match wins, so /dashboard/my-bot doesn't match /dashboard first.
  return [...ALL_NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    );
}
