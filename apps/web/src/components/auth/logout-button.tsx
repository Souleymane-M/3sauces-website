"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);

  async function deconnexion() {
    setEnCours(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={deconnexion}
      disabled={enCours}
      className="rounded border px-3 py-1 text-sm text-gray-600 disabled:opacity-50"
    >
      Déconnexion
    </button>
  );
}
