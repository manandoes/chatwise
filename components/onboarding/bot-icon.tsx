// Turns the icon name in a bot's config-schema into a real icon.
//
// The names are listed here explicitly rather than looked up dynamically, so
// only these nine icons end up in the bundle instead of the whole icon set.

import {
  CalendarClock,
  Clock,
  ConciergeBell,
  Filter,
  LifeBuoy,
  ShoppingBag,
  Star,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  ConciergeBell,
  Filter,
  CalendarClock,
  Tag,
  LifeBuoy,
  Clock,
  ShoppingBag,
  Star,
  Users,
};

export function BotIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = ICONS[name] ?? ConciergeBell;

  return <Icon aria-hidden className={className} />;
}
