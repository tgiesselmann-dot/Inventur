-- Artikel um drei Unterscheidungen erweitern, die das Modell tragen:
--  1. Liefergebinde (gebindeart, liefer_gebinde_text, einheiten_pro_gebinde)
--     und Zähleinheit (zaehlmodus) sind getrennt.
--  2. Der Einkaufspreis kann je Gebinde oder je Einheit gelten — ek_preis_cent
--     trägt den Betrag, ek_preis_bezug den Bezug.
--  3. schwundfaehig trennt Schwundrechnung von Zählpflicht.
--
-- Der Enum `einheit` und die vier alten Spalten werden ersatzlos gedroppt statt
-- umbenannt: die Tabellen sind zum Zeitpunkt dieser Migration leer (noch kein
-- Seed, keine Erfassung), deshalb gibt es nichts zu übernehmen. Die neuen
-- NOT-NULL-Spalten ohne Default sind aus demselben Grund unkritisch.
--
-- RLS bleibt unberührt — ALTER TABLE ändert die in 20260806211836_enable_rls
-- gesetzte Einstellung nicht, und es kommt keine neue Tabelle hinzu.

-- CreateEnum
CREATE TYPE "gebindeart" AS ENUM ('KASTEN', 'KARTON', 'EINZELFLASCHE', 'FASS');

-- CreateEnum
CREATE TYPE "zaehlmodus" AS ENUM ('GEBINDE_PLUS_EINZELN', 'EINZELN', 'FASS');

-- CreateEnum
CREATE TYPE "ek_preis_bezug" AS ENUM ('PRO_GEBINDE', 'PRO_EINHEIT');

-- AlterTable
ALTER TABLE "artikel" DROP COLUMN "einheit",
DROP COLUMN "ek_preis_gebinde_cent",
DROP COLUMN "gebinde_text",
DROP COLUMN "packungsgroesse",
ADD COLUMN     "einheiten_pro_gebinde" INTEGER NOT NULL,
ADD COLUMN     "einheitsgroesse_liter" DECIMAL(10,3) NOT NULL,
ADD COLUMN     "ek_preis_bezug" "ek_preis_bezug" NOT NULL,
ADD COLUMN     "ek_preis_cent" INTEGER NOT NULL,
ADD COLUMN     "gebindeart" "gebindeart" NOT NULL,
ADD COLUMN     "liefer_gebinde_text" TEXT NOT NULL,
ADD COLUMN     "schwundfaehig" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "zaehlmodus" "zaehlmodus" NOT NULL;

-- AlterTable
ALTER TABLE "zaehlposition" DROP COLUMN "anzahl_flaschen",
ADD COLUMN     "anzahl_einzeln" DECIMAL(10,2) NOT NULL;

-- DropEnum
DROP TYPE "einheit";

-- CreateIndex
CREATE UNIQUE INDEX "artikel_betrieb_id_name_liefer_gebinde_text_key" ON "artikel"("betrieb_id", "name", "liefer_gebinde_text");

