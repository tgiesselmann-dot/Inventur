/**
 * Wann ein Artikel auf eine Suche passt.
 *
 * Eine eigene Datei, weil zwei Welten dieselbe Regel brauchen: die Artikelliste
 * in der Stammpflege und die Zählliste im Lager. Sie könnte in keiner von
 * beiden wohnen — artikelstamm.ts liest bereits aus zaehlung.ts, und zaehlung.ts
 * dürfte deshalb nicht zurücklesen. Zwei Fassungen der Regel wären die
 * Alternative, und dann fände dieselbe Eingabe an zwei Stellen Verschiedenes.
 *
 * Die Regel: alle Wörter müssen vorkommen, in beliebiger Reihenfolge, ohne
 * Rücksicht auf Gross- und Kleinschreibung. Kein Präfix-Zwang — wer "cola"
 * tippt, meint auch "Coca Cola". Keine unscharfe Suche: im Lager ist ein
 * Treffer, den man nicht erklären kann, schlimmer als keiner.
 */

/** Die Suche in ihre Wörter zerlegt. Leer heisst: es wird nicht gesucht. */
export function suchwoerter(suche: string): string[] {
  return suche.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

/**
 * Ob ein Text auf die Suche passt. Eine leere Suche passt auf alles — sie ist
 * keine Einschränkung, sondern deren Abwesenheit.
 */
export function passtAufText(heuhaufen: string, suche: string): boolean {
  const woerter = suchwoerter(suche)
  if (woerter.length === 0) return true

  const text = heuhaufen.toLowerCase()
  return woerter.every((wort) => text.includes(wort))
}

/**
 * Ob ein Artikel auf die Suche passt.
 *
 * Gesucht wird in Name und Liefergebindetext zusammen, weil erst beides einen
 * Artikel benennt: "Cola 24" muss die 24er-Kiste finden, obwohl die 24 nicht im
 * Namen steht, und "Gerolsteiner 0,75" die grosse Flasche von der kleinen
 * trennen.
 */
export function passtZurSuche(
  artikel: { name: string; lieferGebindeText: string },
  suche: string,
): boolean {
  return passtAufText(`${artikel.name} ${artikel.lieferGebindeText}`, suche)
}
