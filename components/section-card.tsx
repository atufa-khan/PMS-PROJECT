export function SectionCard({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl2 border border-border/80 bg-white/85 p-6 shadow-card">
      <div className="mb-4">
        <h3 className="text-xl font-semibold">{title}</h3>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
