import { Geruest } from '../geruest'

/**
 * Bestellungen haben keinen eigenen Navigationseintrag — sie sind der
 * Seitenzweig der Lieferungen. Das Gerüst kommt deshalb ohne `aktiv`.
 */
export default function Layout({ children }: LayoutProps<'/bestellungen'>) {
  return <Geruest>{children}</Geruest>
}
