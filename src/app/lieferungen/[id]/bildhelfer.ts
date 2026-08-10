/**
 * Verkleinert das Lieferschein-Foto, bevor es zum Server geht.
 *
 * Ein Handyfoto sind heute 4000 Pixel Kante und mehrere Megabyte; lesbar sein
 * muss darauf eine Beleg-Nummer. 1600 Pixel an der langen Kante reichen dafür
 * und machen den Upload an der Rampe — wo das Netz selten gut ist — um eine
 * Grössenordnung kleiner.
 *
 * Keine Geschäftszahl, deshalb bewusst ohne Test: das Projekt testet src/lib,
 * und diese Datei ist reine Browser-Bildarbeit (createImageBitmap, Canvas).
 * Läuft nur im Browser — sie gehört zur Prüfmaske, nicht nach src/lib.
 */

/** Ein Foto auf höchstens `maxKante` Pixel Kante, als JPEG. */
export async function fotoVerkleinern(datei: File, maxKante = 1600): Promise<Blob> {
  let bild: ImageBitmap
  try {
    // from-image wendet die EXIF-Drehung an — sonst liegt jedes iPhone-Foto
    // im Beleg quer.
    bild = await createImageBitmap(datei, { imageOrientation: 'from-image' })
  } catch {
    try {
      // Ältere Browser kennen die Option nicht.
      bild = await createImageBitmap(datei)
    } catch {
      // Kein Bitmap — dann geht das Foto unverkleinert. Ein grosser Beleg ist
      // besser als gar keiner.
      return datei
    }
  }

  try {
    const anteil = Math.min(1, maxKante / Math.max(bild.width, bild.height))
    if (anteil === 1 && datei.type === 'image/jpeg') return datei

    const flaeche = document.createElement('canvas')
    flaeche.width = Math.round(bild.width * anteil)
    flaeche.height = Math.round(bild.height * anteil)

    const kontext = flaeche.getContext('2d')
    if (kontext === null) return datei
    kontext.drawImage(bild, 0, 0, flaeche.width, flaeche.height)

    const blob = await new Promise<Blob | null>((fertig) =>
      flaeche.toBlob(fertig, 'image/jpeg', 0.8),
    )
    // toBlob darf null liefern (etwa bei erschöpftem Speicher) — dann wieder:
    // lieber das Original als nichts.
    return blob ?? datei
  } finally {
    bild.close()
  }
}
