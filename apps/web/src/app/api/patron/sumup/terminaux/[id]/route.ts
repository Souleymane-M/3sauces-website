import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { supprimerTerminalSumup } from "@/lib/patron/terminaux-sumup";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id } = await params;

  try {
    await supprimerTerminalSumup(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
