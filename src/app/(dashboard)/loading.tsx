import { CargandoSeccion } from "@/components/layout/CargandoSeccion";

// Aparece AL INSTANTE al cambiar de sección, mientras el servidor trae los
// datos: el ícono de la app con su porcentaje de carga, en vez de dejar la
// pantalla "congelada". No afecta datos ni lógica.
export default function Loading() {
  return <CargandoSeccion />;
}
