/**
 * Der Stand der Warteschlange: ein Punkt und ein Satz.
 *
 * Der Punkt trägt die Aussage nicht allein — daneben steht sie als Wort, und
 * der Text wechselt mit ihm die Farbe. Wer im Lager auf das Telefon sieht,
 * soll ohne Lesen erkennen, ob noch etwas offen ist, und beim Lesen erfahren,
 * was.
 *
 * Drei Tonlagen: gespeichert (ruhig), offen/wartend (attention — löst sich
 * von allein), abgelehnt und abgemeldet (danger — lösen sich nicht von
 * allein). Für die beiden letzten trägt die Zeile den Weg heraus: bei einer
 * Ablehnung „Erneut", bei abgelaufener Anmeldung der Weg zur Anmeldung. Ein
 * „Erneut" gegen eine abgelaufene Sitzung wäre eine Taste, die nichts tut.
 *
 * Der Wortlaut kommt aus `statusText` in src/offline/warteschlange.ts — eine
 * Formulierung, eine Stelle.
 */

import Link from 'next/link'

import { statusText, type Sammelstatus } from '@/offline/warteschlange'

export function Statuszeile({
  status,
  aufErneut,
}: {
  status: Sammelstatus
  /** Stösst den Versand von Hand an — gezeigt nur, wenn der Server abgelehnt hat. */
  aufErneut?: () => void
}) {
  const stockt = status.art === 'abgelehnt' || status.art === 'abgemeldet'
  const punkt =
    status.art === 'gespeichert' ? 'bg-confirm' : stockt ? 'bg-danger' : 'bg-attention'
  const ton =
    status.art === 'gespeichert'
      ? 'text-text-muted'
      : stockt
        ? 'text-danger-text'
        : 'text-attention-text'
  // Klein im Kopf, aber mit voller Tap-Höhe: der negative Rand hält die Zeile
  // schlank, die Fläche bleibt 56 px.
  const handlung =
    'tap -my-3 inline-flex min-h-tap shrink-0 items-center rounded-ctl px-2 font-semibold text-primary-text focus-visible:fokus'

  return (
    <p className="flex min-w-0 items-center gap-1.5 text-sm">
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${punkt}`} />
      <span className={`truncate ${ton}`}>{statusText(status)}</span>
      {status.art === 'abgelehnt' && aufErneut !== undefined && (
        <button type="button" onClick={aufErneut} className={handlung}>
          Erneut
        </button>
      )}
      {status.art === 'abgemeldet' && (
        // Der Weg hinaus ist sicher: die Werte liegen im Gerät und werden nach
        // der Anmeldung von selbst nachgeschickt.
        <Link href="/anmelden" className={handlung}>
          Anmelden
        </Link>
      )}
    </p>
  )
}
