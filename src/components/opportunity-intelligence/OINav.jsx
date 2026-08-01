import React from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Compass, Building2, Database, Search, Filter, CalendarClock,
  Bot, Activity, BarChart3,
} from "lucide-react";

const TABS = [
  { label: "Overview", to: "/opportunity-intelligence", icon: Compass, exact: true },
  { label: "Target Employers", to: "/opportunity-intelligence/employers", icon: Building2 },
  { label: "Opportunity Sources", to: "/opportunity-intelligence/sources", icon: Database },
  { label: "Search Profile", to: "/opportunity-intelligence/search-profile", icon: Search },
  { label: "Discovery Rules", to: "/opportunity-intelligence/rules", icon: Filter },
  { label: "Search Schedules", to: "/opportunity-intelligence/schedules", icon: CalendarClock },
  { label: "Agent Configuration", to: "/opportunity-intelligence/agents", icon: Bot },
  { label: "Discovery Runs", to: "/opportunity-intelligence/runs", icon: Activity },
  { label: "Source Performance", to: "/opportunity-intelligence/performance", icon: BarChart3 },
];

export default function OINav() {
  const location = useLocation();
  return (
    <div className="mb-6 overflow-x-auto">
      <nav className="flex gap-1 min-w-max">
        {TABS.map((tab) => {
          const active = tab.exact
            ? location.pathname === tab.to
            : location.pathname.startsWith(tab.to);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}