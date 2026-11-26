import { redirect } from "next/navigation";

/** L'ancien site de commande est retiré (décision du patron, 26/11/2026) : cette adresse renvoie vers le site actuel. */
export default function CommanderAncienPage() {
  redirect("/commander");
}
