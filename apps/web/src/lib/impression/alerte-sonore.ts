/**
 * Bip d'alerte pour une nouvelle commande reçue depuis le site public —
 * généré par Web Audio API (deux notes ascendantes), pas de fichier audio à
 * gérer. Un seul `AudioContext` créé puis réutilisé pour chaque bip : Safari
 * iPad peut brider la création répétée d'`AudioContext`. Note : le tout
 * premier bip d'une session peut nécessiter qu'un geste utilisateur ait déjà
 * eu lieu sur la page (politique d'autoplay de Safari) — en pratique
 * toujours le cas sur /caisse, où l'employé interagit en continu.
 */
let contexteAudio: AudioContext | null = null;

function obtenirContexteAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (contexteAudio) return contexteAudio;

  const Constructeur =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructeur) return null;

  contexteAudio = new Constructeur();
  return contexteAudio;
}

function jouerNote(contexte: AudioContext, frequence: number, debut: number, duree: number): void {
  const oscillateur = contexte.createOscillator();
  const gain = contexte.createGain();
  oscillateur.type = "sine";
  oscillateur.frequency.value = frequence;

  const maintenant = contexte.currentTime;
  gain.gain.setValueAtTime(0.0001, maintenant + debut);
  gain.gain.exponentialRampToValueAtTime(0.3, maintenant + debut + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, maintenant + debut + duree);

  oscillateur.connect(gain);
  gain.connect(contexte.destination);
  oscillateur.start(maintenant + debut);
  oscillateur.stop(maintenant + debut + duree + 0.05);
}

export function jouerAlerteSonore(): void {
  const contexte = obtenirContexteAudio();
  if (!contexte) return;

  if (contexte.state === "suspended") {
    contexte.resume().catch(() => {});
  }

  jouerNote(contexte, 880, 0, 0.18);
  jouerNote(contexte, 1046, 0.22, 0.22);
}
