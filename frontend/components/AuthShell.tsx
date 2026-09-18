import Link from "next/link";

export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-paper px-6 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="font-serif text-2xl text-ink">
          SamAI
        </Link>
        <h1 className="mt-8 font-serif text-3xl text-ink">{title}</h1>
        <p className="mt-2 text-slate">{subtitle}</p>
        <div className="mt-8 border border-line bg-paper p-6 sm:p-8">{children}</div>
      </div>
    </main>
  );
}
