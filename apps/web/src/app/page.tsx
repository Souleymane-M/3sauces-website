import { redirect } from "next/navigation";
import { normaliserSourceCampagne } from "@/lib/campagne";

/** L'étiquette de campagne (`?src=`) doit survivre à la redirection, sinon elle est perdue avant d'être lue. */
export default async function Home({ searchParams }: PageProps<"/">) {
  const { src, offre } = await searchParams;
  const source = normaliserSourceCampagne(Array.isArray(src) ? src[0] : src);
  const parametres = new URLSearchParams();
  if (source) parametres.set("src", source);
  // Lien direct vers l'offre du Menu Étudiant (seule valeur acceptée).
  if ((Array.isArray(offre) ? offre[0] : offre) === "menu-etudiant") parametres.set("offre", "menu-etudiant");
  const suite = parametres.toString();
  redirect(suite ? `/commander?${suite}` : "/commander");
}
