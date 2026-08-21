export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl">{children}</div>
    </main>
  );
}
