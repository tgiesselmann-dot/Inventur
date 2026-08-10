import { Geruest } from '../../geruest'

/**
 * Die Abweichungsseiten tragen das Gerüst. Es liegt hier und nicht eine Ebene
 * höher, weil unter /lieferungen/[id] die Vollbild-Masken (Wareneingang,
 * Preise, Prüfung) wohnen — die füllen den Bildschirm mit Absicht.
 */
export default function Layout({ children }: LayoutProps<'/lieferungen/abweichungen'>) {
  return <Geruest aktiv="lieferungen">{children}</Geruest>
}
