import { redirect } from "next/navigation";

/** Le nouveau site est désormais la page /commander : cette ancienne adresse de test y renvoie. */
export default function CommanderNouveauPage() {
  redirect("/commander");
}
