// Esqueleto que aparece AL INSTANTE al cambiar de sección, mientras el
// servidor trae los datos. Hace que la navegación se sienta fluida en vez
// de "congelada". No afecta datos ni lógica.
export default function Loading() {
  const block = "rounded-2xl bg-[rgba(var(--surface-2),0.55)] border border-[rgba(var(--border),0.4)]";
  return (
    <div className="space-y-6 animate-pulse">
      <div className={`h-28 md:h-32 rounded-3xl bg-[rgba(var(--surface-2),0.55)] border border-[rgba(var(--border),0.4)]`} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`h-24 ${block}`} />
        ))}
      </div>
      <div className={`h-72 md:h-80 rounded-3xl bg-[rgba(var(--surface-2),0.55)] border border-[rgba(var(--border),0.4)]`} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`h-24 ${block}`} />
        ))}
      </div>
    </div>
  );
}
