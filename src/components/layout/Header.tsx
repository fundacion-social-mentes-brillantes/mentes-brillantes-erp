import { Bell, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function Header({ userEmail, userRole = 'user' }: { userEmail?: string, userRole?: string }) {
  return (
    <header className="h-16 border-b border-zinc-200 bg-white px-6 pl-16 md:pl-6 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
          <Input
            type="search"
            placeholder="Buscar..."
            className="pl-9 bg-zinc-50 border-zinc-200 focus-visible:ring-zinc-300 w-full"
          />
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <button className="relative p-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
        </button>
        <div className="flex items-center gap-3 border-l border-zinc-200 pl-4 ml-2">
          <div className="flex flex-col items-end">
            <span className="text-sm font-medium text-zinc-700">{userEmail}</span>
            {userRole === 'admin' ? (
              <span className="text-[10px] sm:text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full mt-0.5">
                Administrador
              </span>
            ) : (
              <span className="text-[10px] sm:text-xs font-medium bg-zinc-100 text-zinc-600 border border-zinc-200 px-2 py-0.5 rounded-full mt-0.5">
                Usuario
              </span>
            )}
          </div>
          <div className="h-8 w-8 rounded-full bg-zinc-900 text-white flex items-center justify-center text-sm font-medium shadow-sm border border-zinc-800">
            {userEmail ? userEmail.charAt(0).toUpperCase() : 'U'}
          </div>
        </div>
      </div>
    </header>
  );
}
