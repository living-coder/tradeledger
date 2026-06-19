"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { TrendingUp, List, BarChart2, Settings, RefreshCw, Sun, Moon } from "lucide-react";
import { useData } from "@/context/data-context";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/trades", label: "Option Activity", icon: List },
  { href: "/pnl", label: "Monthly P&L", icon: BarChart2 },
  { href: "/setup", label: "Setup", icon: Settings },
];

export function Nav() {
  const pathname = usePathname();
  const { loading, refresh, data } = useData();
  const { theme, toggle } = useTheme();

  return (
    <header className="border-b bg-background sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 flex items-center h-14 gap-6">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <TrendingUp className="h-5 w-5 text-emerald-500" />
          <span className="font-semibold tracking-tight text-sm">Trade Ledger</span>
        </Link>

        <nav className="flex items-center gap-1 flex-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors",
                pathname === href
                  ? "bg-muted font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {data?.lastSync && (
            <span className="hidden sm:block">Last sync: {new Date(data.lastSync).toLocaleTimeString()}</span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={refresh}
            disabled={loading}
            className="gap-1.5 h-8"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={toggle}
            className="h-8 w-8 p-0"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}
