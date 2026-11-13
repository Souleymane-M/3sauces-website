import { redirect } from "next/navigation";
import { normaliserSourceCampagne } from "@/lib/campagne";

/** L'étiquette de campagne (`?src=`) doit survivre à la redirection, sinon elle est perdue avant d'être lue. */
export default async function Home({ searchParams }: PageProps<"/">) {
  const { src } = await searchParams;
  const source = normaliserSourceCampagne(Array.isArray(src) ? src[0] : src);
  redirect(source ? `/commander?src=${encodeURIComponent(source)}` : "/commander");
}
