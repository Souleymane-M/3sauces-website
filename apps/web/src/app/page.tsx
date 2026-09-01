import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">3 Sauces</h1>
      <p className="text-gray-500">Système complet — en construction.</p>
      <nav className="flex gap-4">
        <Link className="underline font-semibold" href="/commander">
          Commander
        </Link>
        <Link className="underline" href="/caisse">
          Caisse
        </Link>
        <Link className="underline" href="/livreur">
          Livreur
        </Link>
        <Link className="underline" href="/patron">
          Patron
        </Link>
      </nav>
    </main>
  );
}
