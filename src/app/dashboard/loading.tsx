export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-[#e6ece6]" />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-2xl border border-[#e6ece6] bg-white" />
        ))}
      </div>
      <div className="mt-7 h-72 animate-pulse rounded-2xl border border-[#e6ece6] bg-white" />
    </main>
  );
}
