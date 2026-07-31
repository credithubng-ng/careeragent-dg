import React, { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import {
  LayoutDashboard, ListTodo, Briefcase, Send, Wand2, CalendarDays,
  FileText, User, Users, BarChart3, TrendingUp, Database, Settings as SettingsIcon,
  Menu, X, LogOut,
} from "lucide-react";

const NAV = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Today's Priorities", to: "/priorities", icon: ListTodo },
  { label: "Jobs", to: "/jobs", icon: Briefcase },
  { label: "Applications", to: "/applications", icon: Send },
  { label: "Application Studio", to: "/studio", icon: Wand2 },
  { label: "Interviews", to: "/interviews", icon: CalendarDays },
  { label: "CV Library", to: "/cv", icon: FileText },
  { label: "Candidate Profile", to: "/profile", icon: User },
  { label: "Contacts", to: "/contacts", icon: Users },
  { label: "Analytics", to: "/analytics", icon: BarChart3 },
  { label: "Weekly Review", to: "/weekly-review", icon: TrendingUp },
  { label: "Job Sources", to: "/sources", icon: Database },
  { label: "Settings", to: "/settings", icon: SettingsIcon },
];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await base44.auth.logout();
    } catch {
      /* ignore */
    }
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-background md:flex">
      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">DG</div>
          <span className="font-semibold text-foreground">CareerAgent DG</span>
        </Link>
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-muted"><Menu className="h-5 w-5" /></button>
      </div>

      {/* Sidebar */}
      {open && <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setOpen(false)} />}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card transition-transform md:static md:z-auto md:shrink-0 md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-16 items-center justify-between px-5 border-b border-border">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">DG</div>
            <div className="leading-tight">
              <div className="font-semibold text-foreground text-sm">CareerAgent DG</div>
              <div className="text-[11px] text-muted-foreground">Data Governance Career Agent</div>
            </div>
          </Link>
          <button onClick={() => setOpen(false)} className="md:hidden rounded-lg p-1.5 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
          {NAV.map((item) => {
            const active = location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to));
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border bg-muted/30 p-3">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" /> Log out
          </button>
          <div className="mt-2 text-[11px] text-muted-foreground">60-Day Campaign · Internal MVP</div>
        </div>
      </aside>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}