import { Geruest } from '../geruest'

/** Kassenimport und Zuordnung tragen das Gerüst. */
export default function Layout({ children }: LayoutProps<'/umsatz'>) {
  return <Geruest aktiv="umsatz">{children}</Geruest>
}
