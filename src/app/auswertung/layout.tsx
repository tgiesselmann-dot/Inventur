import { Geruest } from '../geruest'

export default function Layout({ children }: LayoutProps<'/auswertung'>) {
  return <Geruest aktiv="auswertung">{children}</Geruest>
}
