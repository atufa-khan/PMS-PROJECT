export default function Loading() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-xl2 border border-border/80 bg-white/85 p-5 shadow-card backdrop-blur">
          <div className="mb-8 space-y-3">
            <div className="h-4 w-12 animate-pulse rounded bg-stone-200" />
            <div className="h-8 w-40 animate-pulse rounded bg-stone-200" />
            <div className="h-4 w-28 animate-pulse rounded bg-stone-200" />
          </div>
          <div className="mb-6 rounded-2xl border border-border bg-stone-50 p-4">
            <div className="h-4 w-24 animate-pulse rounded bg-stone-200" />
            <div className="mt-2 h-4 w-40 animate-pulse rounded bg-stone-200" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="h-10 animate-pulse rounded-2xl bg-stone-100"
              />
            ))}
          </div>
        </aside>

        <main className="space-y-6">
          <section className="rounded-xl2 border border-border/80 bg-white/80 p-6 shadow-card backdrop-blur">
            <div className="h-4 w-44 animate-pulse rounded bg-stone-200" />
            <div className="mt-4 h-10 w-72 animate-pulse rounded bg-stone-200" />
            <div className="mt-3 h-4 max-w-3xl animate-pulse rounded bg-stone-200" />
          </section>

          <section className="rounded-xl2 border border-border/80 bg-white/80 p-6 shadow-card backdrop-blur">
            <div className="h-5 w-40 animate-pulse rounded bg-stone-200" />
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-28 animate-pulse rounded-2xl bg-stone-100"
                />
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
