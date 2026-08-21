-- Dieselbe Ware nur einmal je Lieferung. Vorab geprüft: der Bestand trägt
-- keine Duplikate, die Indizes greifen sofort.

-- DropIndex: der linke Rand des neuen Unique-Schlüssels deckt lieferung_id ab.
DROP INDEX "lieferposition_lieferung_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "lieferposition_lieferung_id_artikel_id_bestellposition_id_key" ON "lieferposition"("lieferung_id", "artikel_id", "bestellposition_id");

-- Von Hand ergänzt, Prisma kann es im Schema nicht ausdrücken: Postgres sieht
-- zwei NULL-Bestellbezüge als verschieden, der Schlüssel oben liesse unbestellte
-- Ware desselben Artikels also doppelt zu. Dieser partielle Index hält die
-- Regel auch dort.
CREATE UNIQUE INDEX "lieferposition_unbestellt_key" ON "lieferposition"("lieferung_id", "artikel_id") WHERE "bestellposition_id" IS NULL;
