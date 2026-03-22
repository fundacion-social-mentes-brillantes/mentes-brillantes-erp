'use client'

import { Bell, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme/ThemeProvider";

export function Header({ userEmail, userRole = 'user' }: { userEmail?: string, userRole?: string }) {
  const initial = userEmail ? userEmail.charAt(0).toUpperCase() : 'U';

  return (
    <header className="h-16 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] px-6 pl-16 md:pl-6 flex items-center justify-between sticky top-0 z-10 shadow-soft transition-colors">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[rgb(var(--text-muted))]" />
          <Input
            type="search"
            placeholder="Buscar..."
            className="pl-9 bg-[rgb(var(--surface-2))] border-[rgb(var(--border))] focus-visible:ring-[rgb(var(--accent))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--surface-1))]"
          />
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <button className="relative p-2 text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-2))] rounded-full transition-colors border border-transparent">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[rgb(var(--danger))] rounded-full border-2 border-[rgb(var(--surface-1))]"></span>
        </button>
        <div className="flex items-center gap-3 border-l border-[rgb(var(--border))] pl-4 ml-2">
          <div className="flex flex-col items-end">
            <span className="text-sm font-medium text-[rgb(var(--text-primary))]">{userEmail}</span>
            {userRole === 'admin' ? (
              <span className="text-[10px] sm:text-xs font-semibold bg-[rgba(var(--accent),0.14)] text-[rgb(var(--accent-strong))] border border-[rgba(var(--accent),0.4)] px-2 py-0.5 rounded-full mt-0.5">
                Administrador
              </span>
            ) : (
              <span className="text-[10px] sm:text-xs font-medium bg-[rgba(var(--muted-surface),0.6)] text-[rgb(var(--text-muted))] border border-[rgb(var(--border))] px-2 py-0.5 rounded-full mt-0.5">
                Usuario
              </span>
            )}
          </div>
          <div className="h-8 w-8 rounded-full bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] flex items-center justify-center text-sm font-medium shadow-soft border border-[rgba(var(--accent),0.4)]">
            {initial}
          </div>
        </div>
      </div>
    </header>
  );
}

