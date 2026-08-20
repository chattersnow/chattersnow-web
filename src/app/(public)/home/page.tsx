import Image from "next/image";

export default function Home() {
  return (
    <main className="app-shell flex flex-1 items-center justify-center overflow-hidden px-6 py-10 font-[family-name:var(--font-bricolage-grotesque)] sm:px-10">
      <section className="flex w-full max-w-3xl flex-col items-center text-center">
        <div className="relative aspect-square w-[min(88vw,28rem)]">
          <Image
            src="/chatter-logo-transparent.png"
            alt="Chatter Snow logo"
            width={448}
            height={448}
            priority
            className="h-full w-full object-contain"
          />
        </div>

        <div className="rainbow-accent sm:mt-9 sm:w-40" />
        <p className="mt-6 max-w-full px-2 text-xs font-bold uppercase tracking-[0.22em] text-[#70419a] sm:mt-7 sm:text-sm sm:tracking-[0.26em]">
          Coming soon
        </p>
      </section>
    </main>
  );
}
