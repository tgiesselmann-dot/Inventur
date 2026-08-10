import { describe, expect, it } from 'vitest'

import {
  leseGroesseLiter,
  schlageZuordnungVor,
  type Zuordnungskandidat,
} from '@/lib/kassenzuordnung'

/** Ein Ausschnitt aus dem Stadthafen-Stamm, so wie ihn der Artikelimport anlegt. */
const STAMM: Zuordnungskandidat[] = [
  {
    id: 'sprudel-025',
    name: 'Gerolsteiner Sprudel',
    kategorie: 'Wasser',
    lieferGebindeText: '24 x 0,25',
    einheitsgroesseLiter: '0.25',
  },
  {
    id: 'sprudel-075',
    name: 'Gerolsteiner Sprudel',
    kategorie: 'Wasser',
    lieferGebindeText: '12 x 0,75',
    einheitsgroesseLiter: '0.75',
  },
  {
    id: 'still-025',
    name: 'Gerolsteiner Still',
    kategorie: 'Wasser',
    lieferGebindeText: '24 x 0,25',
    einheitsgroesseLiter: '0.25',
  },
  {
    id: 'cola-033',
    name: 'Coca Cola',
    kategorie: 'AFG',
    lieferGebindeText: '24 x 0,33',
    einheitsgroesseLiter: '0.33',
  },
  {
    id: 'cola-100',
    name: 'Coca Cola',
    kategorie: 'AFG',
    lieferGebindeText: '12 x 1,0',
    einheitsgroesseLiter: '1',
  },
  {
    id: 'vodka',
    name: 'Dockside Vodka',
    kategorie: 'Spirituosen',
    lieferGebindeText: '0,7 l',
    einheitsgroesseLiter: '0.7',
  },
  {
    id: 'nuggets',
    name: 'Pommes Frites',
    kategorie: 'Speisen',
    lieferGebindeText: '1 x 2,5',
    einheitsgroesseLiter: '2.5',
  },
]

describe('leseGroesseLiter', () => {
  it('liest Literangaben mit und ohne l', () => {
    expect(leseGroesseLiter('Coca Cola 0,33l')?.toString()).toBe('0.33')
    expect(leseGroesseLiter('Veltins 0,4')?.toString()).toBe('0.4')
  })

  it('rechnet Zentiliter in Liter um', () => {
    expect(leseGroesseLiter('Vodka Shot 2cl')?.toString()).toBe('0.02')
  })

  it('hält eine blosse ganze Zahl nicht für eine Grösse', () => {
    // "10 Nuggets" sind zehn Stück und keine zehn Liter.
    expect(leseGroesseLiter('10 Nuggets')).toBeNull()
  })

  it('gibt null zurück, wo keine Grösse steht', () => {
    expect(leseGroesseLiter('Aperol Spritz')).toBeNull()
  })
})

describe('schlageZuordnungVor', () => {
  it('erkennt den abgekürzten Namen der Kasse', () => {
    const [erster] = schlageZuordnungVor('Gerolst. Sprudel 0,25l', STAMM)
    expect(erster.artikelId).toBe('sprudel-025')
    expect(erster.einheitenProVerkauf).toBe('1')
  })

  it('wählt über die Grösse zwischen zwei gleichnamigen Gebinden', () => {
    // Beide heissen "Gerolsteiner Sprudel"; nur die Grösse unterscheidet sie.
    const [erster] = schlageZuordnungVor('Gerolst. Sprudel 0,75l', STAMM)
    expect(erster.artikelId).toBe('sprudel-075')
  })

  it('verwechselt Sprudel und Still nicht', () => {
    const vorschlaege = schlageZuordnungVor('Gerolst. Still 0,25l', STAMM)
    expect(vorschlaege[0].artikelId).toBe('still-025')
  })

  it('schlägt für den Ausschank den Anteil einer Flasche vor', () => {
    // Ein 0,3-l-Glas aus der Literflasche sind 0,3 Einheiten. Ohne diese
    // Umrechnung stünde die Kassenmenge unvermittelt neben der gezählten.
    const vorschlaege = schlageZuordnungVor('Coca Cola 0,3l', STAMM)
    const literflasche = vorschlaege.find((vorschlag) => vorschlag.artikelId === 'cola-100')
    expect(literflasche?.einheitenProVerkauf).toBe('0.3')
  })

  it('rechnet den 2-cl-Schnaps auf die 0,7er Flasche um', () => {
    const [erster] = schlageZuordnungVor('Vodka Shot 2cl', STAMM)
    expect(erster.artikelId).toBe('vodka')
    // 0,02 / 0,7 = 0,0286 — auf drei Stellen, wie es die Spalte hergibt.
    expect(erster.einheitenProVerkauf).toBe('0.029')
  })

  it('schlägt nichts vor, wo nichts passt', () => {
    // Der Kassenexport führt tausend Speisen. Ein Vorschlag ins Blaue wäre
    // schlimmer als keiner: er würde bestätigt und erzeugte falsche Verkäufe.
    expect(schlageZuordnungVor('Bitte OHNE KETCHUP', STAMM)).toEqual([])
    expect(schlageZuordnungVor('EC-/Kreditkarte Im Haus', STAMM)).toEqual([])
  })

  it('gibt höchstens die verlangte Zahl an Vorschlägen zurück', () => {
    expect(schlageZuordnungVor('Gerolsteiner Sprudel', STAMM, 1)).toHaveLength(1)
  })

  it('sortiert den besten Treffer nach vorn', () => {
    const vorschlaege = schlageZuordnungVor('Coca Cola 0,33l', STAMM)
    expect(vorschlaege[0].artikelId).toBe('cola-033')
    expect(vorschlaege[0].guete).toBeGreaterThan(vorschlaege[1]?.guete ?? 0)
  })

  it('begründet jeden Vorschlag mit Artikel und Gebinde', () => {
    const [erster] = schlageZuordnungVor('Gerolst. Sprudel 0,25l', STAMM)
    expect(erster.begruendung).toContain('Gerolsteiner Sprudel')
    expect(erster.begruendung).toContain('24 x 0,25')
    // Einzeln daneben, weil die Maske Name und Gebinde verschieden gross setzt
    // und den zusammengesetzten Satz sonst wieder zerlegen müsste.
    expect(erster.artikelName).toBe('Gerolsteiner Sprudel')
    expect(erster.gebindeText).toBe('24 x 0,25')
  })

  it('warnt, wo ein Ausschank fast das ganze Gebinde leert', () => {
    // Der teuerste Fehler dieses Bildschirms: "Cola 0,3" auf die 0,33er-Flasche
    // ergibt 0,909 Einheiten je Verkauf. Die Zahl sieht plausibel aus, der
    // Bestand geht auf, und der Schwund wandert still in die Auswertung.
    const vorschlaege = schlageZuordnungVor('Coca Cola 0,3l', STAMM)
    const kleineFlasche = vorschlaege.find((vorschlag) => vorschlag.artikelId === 'cola-033')

    expect(kleineFlasche?.einheitenProVerkauf).toBe('0.909')
    expect(kleineFlasche?.warnung).toContain('andere')
  })

  it('warnt, wo die Kasse mehr bucht, als in eine Einheit passt', () => {
    const vorschlaege = schlageZuordnungVor('Coca Cola 0,5l', STAMM)
    const kleineFlasche = vorschlaege.find((vorschlag) => vorschlag.artikelId === 'cola-033')

    expect(kleineFlasche?.warnung).toContain('anderes Gebinde')
  })

  it('lässt den glatten Ausschank ohne Warnung', () => {
    // 0,3 l aus der Literflasche ist ein Ausschank und keine Verwechslung.
    const vorschlaege = schlageZuordnungVor('Coca Cola 0,3l', STAMM)
    const literflasche = vorschlaege.find((vorschlag) => vorschlag.artikelId === 'cola-100')

    expect(literflasche?.warnung).toBeNull()
  })
})
