import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  if (!supabase) return <>{children}</>;
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  
  let userRole = 'user';
  try {
    const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single();
    if (perfil) userRole = perfil.rol;
  } catch (e) {
    // default to user role on error
  }

  return (
    <div className="flex h-screen bg-[rgb(var(--bg))] text-[rgb(var(--text-primary))] overflow-hidden transition-colors">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden bg-[rgb(var(--surface-2))]">
        <Header userEmail={user.email} userRole={userRole} />
        <main className="flex-1 overflow-y-auto p-6 bg-[rgb(var(--surface-2))]">
          {children}
        </main>
      </div>
    </div>
  );
}

