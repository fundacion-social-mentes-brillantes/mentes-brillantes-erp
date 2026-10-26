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
    <div className="flex h-[100dvh] overflow-hidden bg-fondo text-tinta">
      <Sidebar role={perfil.rol} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header userEmail={user.email ?? perfil.nombre} userRole={perfil.rol} />
        <main id="contenido" className={`flex-1 overflow-y-auto ${showBottomNav ? "has-mobile-nav" : ""}`}>
          <div className="mx-auto w-full max-w-[1400px] px-4 py-5 md:px-8 md:py-7">{children}</div>
        </main>
      </div>
      <MobileBottomNav role={perfil.rol} />
    </div>
  );
}
