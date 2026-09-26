// Turns a nav item's icon name into a real icon. Listed explicitly so only
// these icons are bundled.

import {
  BarChart3,
  BookOpen,
  Bot,
  CalendarDays,
  Contact,
  CreditCard,
  Filter,
  KanbanSquare,
  Package,
  Plug,
  UsersRound,
  LayoutDashboard,
  Megaphone,
  MessageSquareText,
  MessagesSquare,
  Settings,
  Smartphone,
  Users,
  Wallet,
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
  MessageSquareText,
  Contact,
  KanbanSquare,
  CalendarDays,
  Package,
  Plug,
  UsersRound,
  Filter,
  Wallet,
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
