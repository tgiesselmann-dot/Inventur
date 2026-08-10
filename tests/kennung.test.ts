import { describe, expect, it } from 'vitest'

import { istKennung } from '@/lib/kennung'

describe('istKennung', () => {
  it('erkennt eine UUID', () => {
    expect(istKennung('019fe394-27fc-701b-ad4b-122e36fee13b')).toBe(true)
  })

  it('erkennt Grossschreibung', () => {
    expect(istKennung('019FE394-27FC-701B-AD4B-122E36FEE13B')).toBe(true)
  })

  it('weist Pfadwörter ab', () => {
    expect(istKennung('liste')).toBe(false)
    expect(istKennung('neu')).toBe(false)
  })

  it('weist Beinahe-UUIDs ab', () => {
    expect(istKennung('019fe394-27fc-701b-ad4b-122e36fee13')).toBe(false)
    expect(istKennung('019fe394-27fc-701b-ad4b-122e36fee13bb')).toBe(false)
    expect(istKennung('019fe39427fc701bad4b122e36fee13b')).toBe(false)
    expect(istKennung('019fe394-27fc-701b-ad4b-122e36fee13g')).toBe(false)
  })

  it('weist Leeres ab', () => {
    expect(istKennung('')).toBe(false)
  })
})
