// Turns a nav item's icon name into a real icon. Listed explicitly so only
// these icons are bundled.

import {
  BarChart3,
  BookOpen,
  Bot,
  CreditCard,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Settings,
  Smartphone,
  Users,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Bot,
  Smartphone,
  MessagesSquare,
  Users,
  BookOpen,
  Megaphone,
  BarChart3,
  CreditCard,
  Settings,
};

export function NavIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = ICONS[name] ?? LayoutDashboard;

  return <Icon aria-hidden className={className} />;
}
