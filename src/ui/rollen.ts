/**
 * Die eine Rollen-→-Klassen-Tabelle des Produkts.
 *
 * Vor ihr schrieb jede Maske ihre eigene Map und buchstabierte
 * `bg-danger-soft text-danger-soft-on` von Hand neu — fünfzehn Tabellen, die
 * bei jeder Rollenänderung einzeln stimmen mussten. Hier steht jede Facette
 * genau einmal; wer eine Rolle zeigt, nimmt die Facette, nicht die Klassen.
 * Fachliche Tabellen (Importstand, Schwundstufe, Zeilenstand) bleiben in ihren
 * Masken — sie übersetzen nur noch Fachbegriff → Rolle, nicht mehr → Klassen.
 *
 * Die Facetten:
 * - `voll`    gefüllte Fläche samt Textstufe — die Schaltfläche.
 * - `flaeche` getönte Fläche samt Textstufe — die Hinweisleiste.
 * - `schrift` die Textstufe auf der eigenen getönten Fläche, einzeln — für
 *             Kinder einer Fläche, die ihre Farbe ausdrücklich tragen.
 * - `punkt`   der Statuspunkt. Er trägt seine Farbe nie allein; derselbe
 *             Zustand steht daneben als Wort.
 * - `text`    die Textfarbe der Rolle auf dem Grund.
 * - `kante`   die farbige linke Kante einer Karte oder Zeile.
 * - `rand`    der Rand in der Rollenfarbe, wo eine Fläche umrandet ist.
 *
 * `neutral` ist keine Farbrolle aus globals.css, sondern das begründete Grau:
 * kein Befund, keine Aussage. Sein `text` ist gedämpft, weil ein neutrales
 * Wort eine Nebeninformation ist — eine neutrale *Zahl* bleibt dagegen
 * `text-text`, denn die Zahl ist die Auskunft selbst; diese Ausnahme steht bei
 * ihren Nehmern (Kennzahl, Wertzeile, Schwundstufe), nicht hier.
 *
 * `preis` (Preisänderung) hat in globals.css nur Punkt-, Text- und Randfarbe —
 * die Rolle markiert, sie flächt nicht.
 */

export const ROLLEN = {
  primary: {
    voll: 'bg-primary text-primary-on',
    flaeche: 'bg-primary-soft text-primary-soft-on',
    schrift: 'text-primary-soft-on',
    punkt: 'bg-primary',
    text: 'text-primary-text',
    kante: 'border-l-primary',
    rand: 'border-primary',
  },
  confirm: {
    voll: 'bg-confirm text-confirm-on',
    flaeche: 'bg-confirm-soft text-confirm-soft-on',
    schrift: 'text-confirm-soft-on',
    punkt: 'bg-confirm',
    text: 'text-confirm-text',
    kante: 'border-l-confirm',
    rand: 'border-confirm',
  },
  attention: {
    voll: 'bg-attention text-attention-on',
    flaeche: 'bg-attention-soft text-attention-soft-on',
    schrift: 'text-attention-soft-on',
    punkt: 'bg-attention',
    text: 'text-attention-text',
    kante: 'border-l-attention',
    rand: 'border-attention',
  },
  danger: {
    voll: 'bg-danger text-danger-on',
    flaeche: 'bg-danger-soft text-danger-soft-on',
    schrift: 'text-danger-soft-on',
    punkt: 'bg-danger',
    text: 'text-danger-text',
    kante: 'border-l-danger',
    rand: 'border-danger',
  },
  preis: {
    punkt: 'bg-preis',
    text: 'text-preis-text',
    kante: 'border-l-preis',
    rand: 'border-preis',
  },
  neutral: {
    flaeche: 'bg-surface-2 text-text',
    schrift: 'text-text',
    punkt: 'bg-border-strong',
    text: 'text-text-muted',
    kante: 'border-l-border-strong',
    rand: 'border-border-strong',
  },
} as const

export type Rolle = keyof typeof ROLLEN

/** Die Rollen, die eine gefüllte Fläche haben — was eine Schaltfläche tragen kann. */
export type Vollrolle = 'primary' | 'confirm' | 'attention' | 'danger'

/** Die Rollen mit getönter Fläche — was eine Hinweisleiste tragen kann. */
export type Flaechenrolle = 'primary' | 'confirm' | 'attention' | 'danger' | 'neutral'
