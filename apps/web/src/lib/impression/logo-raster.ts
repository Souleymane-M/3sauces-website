/**
 * Convertit le logo (PNG couleur) en bitmap monochrome empaqueté (1 bit/pixel,
 * 8 pixels/octet), le format attendu par l'élément `<image>` du protocole
 * ePOS-Print — calculé une seule fois par session de page puis mis en cache
 * (le logo ne change jamais en cours de service). Fichier le plus délicat de
 * toute la fonctionnalité impression : le seuillage noir/blanc ne peut être
 * calibré (contraste, taille) qu'une fois testé sur l'imprimante réelle.
 */
export interface LogoRaster {
  base64: string;
  largeur: number;
  hauteur: number;
}

let logoEnCache: Promise<LogoRaster | null> | null = null;

export function obtenirLogoRasterMemo(): Promise<LogoRaster | null> {
  if (logoEnCache) return logoEnCache;

  logoEnCache = new Promise<LogoRaster | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";

    image.onload = () => {
      try {
        resolve(rasteriser(image));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = "/logo-3sauces.png";
  });

  return logoEnCache;
}

function rasteriser(image: HTMLImageElement): LogoRaster | null {
  // Largeur cible raisonnable pour un ticket 80mm ; doit être un multiple de
  // 8 (empaquetage 8 pixels/octet du format <image>).
  const LARGEUR_CIBLE = 384;
  const largeur = Math.ceil(LARGEUR_CIBLE / 8) * 8;
  const hauteur = Math.round((image.height / image.width) * largeur);

  const canvas = document.createElement("canvas");
  canvas.width = largeur;
  canvas.height = hauteur;
  const contexte = canvas.getContext("2d");
  if (!contexte) return null;

  contexte.fillStyle = "white";
  contexte.fillRect(0, 0, largeur, hauteur);
  contexte.drawImage(image, 0, 0, largeur, hauteur);

  const { data } = contexte.getImageData(0, 0, largeur, hauteur);
  const octetsParLigne = largeur / 8;
  const octets = new Uint8Array(octetsParLigne * hauteur);

  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const i = (y * largeur + x) * 4;
      const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const opaque = data[i + 3] > 10;
      if (opaque && luminance < 128) {
        const indexOctet = y * octetsParLigne + Math.floor(x / 8);
        octets[indexOctet] |= 0x80 >> x % 8;
      }
    }
  }

  let binaire = "";
  for (const octet of octets) binaire += String.fromCharCode(octet);

  return { base64: btoa(binaire), largeur, hauteur };
}
