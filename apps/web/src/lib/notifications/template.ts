import "server-only";

const URL_SITE = "https://3sauces.fr";
const URL_INSTAGRAM = "https://www.instagram.com/3sauces.mayotte";
const URL_FACEBOOK = "https://www.facebook.com/people/3-Sauces/61583668285411/";

/**
 * Habillage visuel commun aux emails envoyés au client (jamais à ceux du
 * restaurant, purement internes/opérationnels) — logo/couleur de marque,
 * bouton de retour vers le site, liens réseaux sociaux en pied de page.
 * CSS entièrement en ligne (`style="..."`), seule approche fiable pour un
 * rendu correct dans la plupart des clients email (Gmail, Outlook...).
 */
export function construireEmailClientHtml(corpsHtml: string, texteBouton: string = "Retourner sur le site"): string {
  return `
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
  <div style="background-color: #8B2020; padding: 24px; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 22px;">3 Sauces</h1>
  </div>
  <div style="padding: 24px; background-color: #FFF8F0; font-size: 15px; line-height: 1.5;">
    ${corpsHtml}
    <div style="text-align: center; margin-top: 28px;">
      <a href="${URL_SITE}" style="background-color: #8B2020; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
        ${texteBouton}
      </a>
    </div>
  </div>
  <div style="padding: 20px; text-align: center; font-size: 12px; color: #777777;">
    <p style="margin: 0 0 10px;">
      <a href="${URL_INSTAGRAM}" style="color: #8B2020; text-decoration: none; margin: 0 10px;">Instagram</a>
      <a href="${URL_FACEBOOK}" style="color: #8B2020; text-decoration: none; margin: 0 10px;">Facebook</a>
    </p>
    <p style="margin: 0;">06 39 63 81 78 — 3 Sauces, 841 bd du Soleil Levant, Iloni, Dembéni</p>
    <p style="margin: 4px 0 0;">En face du collège et de l'école primaire d'Iloni</p>
  </div>
</div>`;
}
