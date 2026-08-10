import { Geruest } from '../geruest'

export default function Layout({ children }: LayoutProps<'/rezepturen'>) {
  return <Geruest aktiv="rezepturen">{children}</Geruest>
}
