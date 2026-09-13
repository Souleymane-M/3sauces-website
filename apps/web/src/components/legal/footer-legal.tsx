import Link from "next/link";

export function FooterLegal() {
  return (
    <footer className="mt-8 border-t border-gray-200 pt-4 pb-2 text-center text-xs text-gray-500">
      <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        <Link href="/mentions-legales" className="hover:underline">
          Mentions légales
        </Link>
        <Link href="/confidentialite" className="hover:underline">
          Politique de confidentialité
        </Link>
        <Link href="/cgv" className="hover:underline">
          CGV
        </Link>
      </nav>
      <p className="mt-2">© {new Date().getFullYear()} 3 Sauces — Tous droits réservés.</p>
    </footer>
  );
}
