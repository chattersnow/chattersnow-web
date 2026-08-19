import Image from "next/image";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-1 flex-col bg-[#f4f1e9] px-6 py-6 text-[#183233] sm:px-10 sm:py-8">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between border-b border-[#183233]/15 pb-5 text-[11px] font-semibold uppercase tracking-[0.2em]">
        <span>Chatter Snow</span>
        <span className="text-[#e96845]">Coming soon</span>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-1 items-center py-20 sm:py-28">
        <div className="max-w-2xl">
          <div className="mb-10 flex h-20 w-20 items-center justify-center overflow-hidden rounded-[1.25rem] border border-[#183233]/10 bg-white shadow-[0_12px_28px_rgba(24,50,51,0.08)]">
            <Image
              src="/chatter logo.png"
              alt="Chatter Snow logo"
              width={80}
              height={80}
              priority
              className="h-full w-full object-contain"
            />
          </div>

          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.24em] text-[#e96845]">
            For queer skiers + snowboarders
          </p>
          <h1 className="max-w-xl text-5xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-7xl">
            A little more joy on the mountain.
          </h1>
          <p className="mt-7 max-w-lg text-base leading-7 text-[#183233]/70 sm:text-lg">
            Chatter Snow is creating a welcoming space for LGBTQ+ people who
            find home on skis, snowboards, and everywhere in between. We are
            getting things ready.
          </p>

          <div className="mt-12 flex items-center gap-3 border-t border-[#183233]/15 pt-5 text-xs font-semibold uppercase tracking-[0.16em] text-[#183233]/60">
            <span className="h-2 w-2 rounded-full bg-[#e96845]" />
            <span>Website in progress</span>
          </div>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-6xl border-t border-[#183233]/15 pt-5 text-xs text-[#183233]/55">
        A community for LGBTQ+ skiers and snowboarders
      </footer>
    </main>
  );
}
