import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { getCurrentProfile } from "@/lib/utils/authz";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  try {
    const { perfil, user } = await getCurrentProfile();
    if (!user) redirect("/login");

    return (
      <div className="flex min-h-screen md:h-screen bg-[rgb(var(--bg))] text-[rgb(var(--text-primary))] overflow-hidden transition-colors">
        <Sidebar role={perfil.rol} />
        <div className="flex-1 flex flex-col overflow-hidden bg-[rgb(var(--surface-2))]">
          <Header userEmail={user.email ?? perfil.nombre} userRole={perfil.rol} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-[rgb(var(--surface-2))]">
            {children}
          </main>
        </div>
      </div>
    );
  } catch (e) {
    redirect("/login");
  }
}
