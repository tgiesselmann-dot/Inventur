import { Geruest } from '../geruest'

/** Alle Artikelseiten (Liste, Detail, Neu, Import) tragen das Gerüst. */
export default function Layout({ children }: LayoutProps<'/artikel'>) {
  return <Geruest aktiv="artikel">{children}</Geruest>
}
