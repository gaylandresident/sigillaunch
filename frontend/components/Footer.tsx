export function Footer() {
  return (
    <footer className="relative z-10 mx-auto mt-32 max-w-6xl px-6 pb-16">
      <div className="hairline mb-8" />
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row">
        <p className="font-serif text-sm italic text-bone-500">
          "Feed the pyre. Own the ashes."
        </p>
        <a
          href="https://x.com/SIGILonrb"
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs uppercase tracking-widest2 text-bone-500 transition-colors hover:text-bone"
        >
          @SIGILonrb ↗
        </a>
      </div>
    </footer>
  );
}
