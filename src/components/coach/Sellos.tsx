/**
 * Los paquetes coach como sellos: uno lleno por cada sesión tomada, como el carné de
 * «Mi proceso». Con más de 40 sesiones se vuelve una barra, para que no ocupe media pantalla.
 */
export function Sellos({ tomadas, total, className = "" }: { tomadas: number; total: number; className?: string }) {
  if (total <= 0) return null;
  const etiqueta = `${tomadas} de ${total} sesiones tomadas`;
  if (total > 40) {
    return (
      <div className={`h-2 overflow-hidden rounded-full bg-suave-2 ${className}`} role="img" aria-label={etiqueta}>
        <div className="h-full rounded-full bg-acento" style={{ width: `${Math.min(100, (tomadas / total) * 100)}%` }} />
      </div>
    );
  }
  return (
    <div className={`flex flex-wrap gap-1 ${className}`} role="img" aria-label={etiqueta}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < tomadas ? "bg-acento" : "bg-suave-2 ring-1 ring-inset ring-linea"}`} />
      ))}
    </div>
  );
}
