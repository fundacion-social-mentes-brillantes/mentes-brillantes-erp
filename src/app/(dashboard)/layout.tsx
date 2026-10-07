import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { getCurrentProfile } from "@/lib/utils/authz";
import { redirect } from "next/navigation";

async function perfilOLogin() {
  try {
    return await getCurrentProfile();
  } catch {
    // Sin sesion o sin perfil: a iniciar sesion.
    redirect("/login");
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { perfil, user } = await perfilOLogin();
  const showBottomNav = perfil.rol !== "consulta";

  // Alto fijo tambien en celular: solo se desplaza <main> y el encabezado (con
  // el boton de menu) no se va con la pagina.
  return (
    <div className="flex h-[100dvh] md:h-screen bg-[rgb(var(--bg))] text-[rgb(var(--text-primary))] overflow-hidden transition-colors">
      <Sidebar role={perfil.rol} />
      <div className="flex-1 flex flex-col overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(var(--gold),0.13),transparent_24rem),linear-gradient(135deg,rgba(var(--surface-2),0.98),rgba(var(--bg),0.94))]">
        <Header userEmail={user.email ?? perfil.nombre} userRole={perfil.rol} />
        <main className={`flex-1 overflow-y-auto p-4 md:p-6 ${showBottomNav ? "has-mobile-nav" : ""}`}>
          {children}
        </main>
      </div>
      <MobileBottomNav role={perfil.rol} />
    </div>
  );
}
