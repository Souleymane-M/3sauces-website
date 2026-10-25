"use client";

import { useRouter } from "next/navigation";
import { BandeauFondsCaisse } from "./tiroir-caisse-app";

export function RappelFondsCaisse() {
  const router = useRouter();
  return <BandeauFondsCaisse onOuvrir={() => router.push("/caisse/tiroir")} />;
}
