"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function PasswordForm() {
  const router = useRouter();
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch("/api/auth/patron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motDePasse }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Mot de passe incorrect.");
        return;
      }
      router.refresh();
    } catch {
      setErreur("Connexion impossible, réessaie.");
    } finally {
      setEnCours(false);
      setMotDePasse("");
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-xs flex-col gap-4"
    >
      <h1 className="text-xl font-bold">Espace Patron</h1>
      <input
        type="password"
        value={motDePasse}
        onChange={(e) => setMotDePasse(e.target.value)}
        placeholder="Mot de passe"
        autoFocus
        disabled={enCours}
        className="rounded border px-3 py-2"
      />
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      <button
        type="submit"
        disabled={enCours || motDePasse.length === 0}
        className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
      >
        Se connecter
      </button>
    </form>
  );
}
