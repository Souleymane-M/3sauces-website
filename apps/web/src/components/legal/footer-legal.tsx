import Link from "next/link";

export function FooterLegal() {
  return (
    <footer className="mt-8 border-t border-gray-200 pt-4 pb-2 text-center text-xs text-gray-500">
      <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        <Link href="/fidelite" className="hover:underline">
          Fidélité
        </Link>
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

      <div className="mt-3 flex justify-center gap-4">
        <a
          href="https://www.instagram.com/3sauces.mayotte"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram 3 Sauces"
          className="text-gray-500 hover:text-gray-800"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
          </svg>
        </a>
        <a
          href="https://www.facebook.com/people/3-Sauces/61583668285411/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Facebook 3 Sauces"
          className="text-gray-500 hover:text-gray-800"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M15 8.5h2V5h-2c-2.2 0-4 1.8-4 4v2H9v3.5h2V21h3.5v-6.5H17l.5-3.5h-3V9c0-.6.4-1 1-1Z" />
          </svg>
        </a>
      </div>

      <p className="mt-3">© {new Date().getFullYear()} 3 Sauces — Tous droits réservés.</p>
      <p className="mt-1">06 39 63 81 78 — 841, bd du Soleil Levant - Iloni - Dembéni</p>
    </footer>
  );
}
