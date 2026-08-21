import { describe, expect, it } from 'vitest'

import { zeilenversand } from '@/lib/zeilenversand'

/** Ein Promise, das der Test von aussen auflöst — die „langsame Antwort". */
function tor() {
  let oeffnen!: () => void
  const offen = new Promise<void>((resolve) => {
    oeffnen = resolve
  })
  return { offen, oeffnen }
}

describe('zeilenversand', () => {
  it('lässt je Zeile immer nur einen Send laufen', async () => {
    const versand = zeilenversand()
    const erste = tor()
    const lauf: string[] = []

    const a = versand.reihe('neu:1', async () => {
      lauf.push('a beginnt')
      await erste.offen
      lauf.push('a endet')
    })
    const b = versand.reihe('neu:1', async () => {
      lauf.push('b beginnt')
    })

    // b wartet, solange a läuft.
    await Promise.resolve()
    expect(lauf).toEqual(['a beginnt'])

    erste.oeffnen()
    await Promise.all([a, b])
    expect(lauf).toEqual(['a beginnt', 'a endet', 'b beginnt'])
  })

  it('lässt Zeilen einander nicht aufhalten', async () => {
    const versand = zeilenversand()
    const erste = tor()
    const lauf: string[] = []

    const a = versand.reihe('neu:1', async () => {
      await erste.offen
      lauf.push('a')
    })
    const b = versand.reihe('neu:2', async () => {
      lauf.push('b')
    })

    await b
    expect(lauf).toEqual(['b'])
    erste.oeffnen()
    await a
  })

  it('reicht die vergebene Id an den wartenden Send weiter', async () => {
    const versand = zeilenversand()
    const gesehen: (string | null)[] = []

    await versand.reihe('neu:1', async (vergebene) => {
      gesehen.push(vergebene)
      versand.vergeben('neu:1', 'echte-id')
    })
    await versand.reihe('neu:1', async (vergebene) => {
      gesehen.push(vergebene)
    })

    expect(gesehen).toEqual([null, 'echte-id'])
  })

  it('führt Sends unter der echten Id in derselben Kette weiter', async () => {
    const versand = zeilenversand()
    const zweite = tor()
    const lauf: string[] = []

    await versand.reihe('neu:1', async () => {
      versand.vergeben('neu:1', 'echte-id')
    })
    // Die Maske hat die Zeile inzwischen umbenannt; ein alter Send mit der
    // vorläufigen und ein neuer mit der echten Kennung dürfen einander nicht
    // überholen.
    const alt = versand.reihe('neu:1', async () => {
      await zweite.offen
      lauf.push('alter Stand')
    })
    const neu = versand.reihe('echte-id', async (vergebene) => {
      lauf.push(`neuer Stand mit ${vergebene}`)
    })

    await Promise.resolve()
    expect(lauf).toEqual([])
    zweite.oeffnen()
    await Promise.all([alt, neu])
    expect(lauf).toEqual(['alter Stand', 'neuer Stand mit echte-id'])
  })

  it('lässt die Kette einen Fehler überleben', async () => {
    const versand = zeilenversand()
    const lauf: string[] = []

    const a = versand.reihe('neu:1', async () => {
      throw new Error('Netz weg')
    })
    await expect(a).rejects.toThrow('Netz weg')

    await versand.reihe('neu:1', async () => {
      lauf.push('läuft trotzdem')
    })
    expect(lauf).toEqual(['läuft trotzdem'])
  })
})
