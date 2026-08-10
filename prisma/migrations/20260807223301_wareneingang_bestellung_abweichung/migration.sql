-- Wareneingang: Bestellung, geprüfte Lieferung, Abweichung.
--
-- Bisher hatte eine Lieferposition genau eine Menge. Damit lässt sich nicht
-- prüfen, ob geliefert wurde, was bestellt war, und ob auf der Palette stand,
-- was der Lieferschein berechnet. Diese Migration bringt die drei Mengen des
-- Wareneingangs zusammen:
--
--   bestellt      -> bestellposition.anzahl_gebinde
--   Lieferschein  -> lieferposition.anzahl_gebinde_lieferschein
--   tatsächlich   -> lieferposition.anzahl_gebinde_tatsaechlich
--
-- Die bestellte Menge wird nicht in die Lieferposition kopiert, sondern über
-- lieferposition.bestellposition_id gelesen. Eine kopierte Menge wäre eine
-- zweite Wahrheit — genau der Fehler der abgelösten Tabellenkalkulation.
--
-- Bestandswirksam ist ausschliesslich anzahl_gebinde_tatsaechlich.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "bestell_status" AS ENUM ('ENTWURF', 'VERSENDET', 'ABGESCHLOSSEN', 'STORNIERT');

-- CreateEnum
CREATE TYPE "abweichungsart" AS ENUM ('FEHLMENGE', 'UEBERLIEFERUNG', 'BRUCH', 'FALSCHER_ARTIKEL', 'PREISABWEICHUNG');

-- CreateEnum
CREATE TYPE "abweichungsstatus" AS ENUM ('OFFEN', 'REKLAMIERT', 'GUTSCHRIFT_ERWARTET', 'ERLEDIGT', 'VERWORFEN');

-- ---------------------------------------------------------------------------
-- Bestellung
-- ---------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "bestellung" (
    "id" UUID NOT NULL,
    "betrieb_id" UUID NOT NULL,
    "datum" DATE NOT NULL,
    "lieferant" TEXT NOT NULL,
    "status" "bestell_status" NOT NULL DEFAULT 'ENTWURF',
    "notiz" TEXT,
    "angelegt_am" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bestellung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bestellposition" (
    "id" UUID NOT NULL,
    "betrieb_id" UUID NOT NULL,
    "bestellung_id" UUID NOT NULL,
    "artikel_id" UUID NOT NULL,
    "anzahl_gebinde" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "bestellposition_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Lieferung: Bestellbezug und Kontrolle
-- ---------------------------------------------------------------------------

-- Kein Feld `kontrollstatus`: ungeprüft heisst geprueft_am IS NULL, und ob eine
-- geprüfte Lieferung Abweichungen hatte, sagen die Abweichungen selbst.

-- AlterTable
ALTER TABLE "lieferung" ADD COLUMN     "bestellung_id" UUID,
ADD COLUMN     "geprueft_am" TIMESTAMPTZ(6),
ADD COLUMN     "geprueft_von_id" UUID,
ADD COLUMN     "fahrer_name" TEXT,
ADD COLUMN     "lieferschein_bild_pfad" TEXT,
ADD COLUMN     "unterschrift_bild_pfad" TEXT;

-- ---------------------------------------------------------------------------
-- Lieferposition: aus einer Menge werden zwei
-- ---------------------------------------------------------------------------

-- Umbenennen statt löschen und neu anlegen. Prisma würde hier DROP COLUMN
-- erzeugen; das verwürfe vorhandene Liefermengen ersatzlos. Die bisherige
-- Menge ist die tatsächlich angenommene — sie ist die bestandswirksame.

-- AlterTable
ALTER TABLE "lieferposition" RENAME COLUMN "anzahl_gebinde" TO "anzahl_gebinde_tatsaechlich";

-- Erst ohne NOT NULL anlegen, füllen, dann verschärfen: für vorhandene Zeilen
-- gibt es keinen Lieferschein-Wert, und die angenommene Menge ist die einzige
-- vertretbare Annahme. Ohne Altdaten ist der UPDATE ein Leerlauf.
ALTER TABLE "lieferposition" ADD COLUMN "anzahl_gebinde_lieferschein" DECIMAL(10,2);
UPDATE "lieferposition" SET "anzahl_gebinde_lieferschein" = "anzahl_gebinde_tatsaechlich";
ALTER TABLE "lieferposition" ALTER COLUMN "anzahl_gebinde_lieferschein" SET NOT NULL;

ALTER TABLE "lieferposition" ADD COLUMN     "bestellposition_id" UUID,
ADD COLUMN     "ek_preis_cent_lieferschein" INTEGER,
ADD COLUMN     "nachlieferung_zugesagt_bis" DATE;

-- ---------------------------------------------------------------------------
-- Leergut
-- ---------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "leergutposition" (
    "id" UUID NOT NULL,
    "betrieb_id" UUID NOT NULL,
    "lieferung_id" UUID NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "anzahl_lieferschein" DECIMAL(10,2) NOT NULL,
    "anzahl_tatsaechlich" DECIMAL(10,2) NOT NULL,
    "pfand_cent_je_einheit" INTEGER,

    CONSTRAINT "leergutposition_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Abweichung und ihr Verlauf
-- ---------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "abweichung" (
    "id" UUID NOT NULL,
    "betrieb_id" UUID NOT NULL,
    "lieferposition_id" UUID NOT NULL,
    "art" "abweichungsart" NOT NULL,
    "anzahl_gebinde" DECIMAL(10,2) NOT NULL,
    "status" "abweichungsstatus" NOT NULL DEFAULT 'OFFEN',
    "gutschrift_cent" INTEGER,
    "notiz" TEXT,
    "festgestellt_am" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abweichung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abweichungsereignis" (
    "id" UUID NOT NULL,
    "betrieb_id" UUID NOT NULL,
    "abweichung_id" UUID NOT NULL,
    "von_status" "abweichungsstatus",
    "nach_status" "abweichungsstatus" NOT NULL,
    "benutzer_id" UUID,
    "notiz" TEXT,
    "zeitpunkt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abweichungsereignis_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Indizes
-- ---------------------------------------------------------------------------

-- CreateIndex
CREATE INDEX "bestellung_betrieb_id_datum_idx" ON "bestellung"("betrieb_id", "datum");

-- CreateIndex
CREATE INDEX "bestellung_betrieb_id_status_idx" ON "bestellung"("betrieb_id", "status");

-- CreateIndex
CREATE INDEX "bestellposition_betrieb_id_idx" ON "bestellposition"("betrieb_id");

-- CreateIndex
CREATE INDEX "bestellposition_artikel_id_idx" ON "bestellposition"("artikel_id");

-- CreateIndex
CREATE UNIQUE INDEX "bestellposition_bestellung_id_artikel_id_key" ON "bestellposition"("bestellung_id", "artikel_id");

-- CreateIndex
CREATE INDEX "leergutposition_betrieb_id_idx" ON "leergutposition"("betrieb_id");

-- CreateIndex
CREATE INDEX "leergutposition_lieferung_id_idx" ON "leergutposition"("lieferung_id");

-- Deckt die Arbeitsliste ab: offene Abweichungen eines Betriebs, älteste zuerst.
-- CreateIndex
CREATE INDEX "abweichung_betrieb_id_status_festgestellt_am_idx" ON "abweichung"("betrieb_id", "status", "festgestellt_am");

-- CreateIndex
CREATE INDEX "abweichung_lieferposition_id_idx" ON "abweichung"("lieferposition_id");

-- CreateIndex
CREATE INDEX "abweichungsereignis_betrieb_id_idx" ON "abweichungsereignis"("betrieb_id");

-- CreateIndex
CREATE INDEX "abweichungsereignis_abweichung_id_zeitpunkt_idx" ON "abweichungsereignis"("abweichung_id", "zeitpunkt");

-- CreateIndex
CREATE INDEX "abweichungsereignis_benutzer_id_idx" ON "abweichungsereignis"("benutzer_id");

-- CreateIndex
CREATE INDEX "lieferung_bestellung_id_idx" ON "lieferung"("bestellung_id");

-- CreateIndex
CREATE INDEX "lieferung_geprueft_von_id_idx" ON "lieferung"("geprueft_von_id");

-- CreateIndex
CREATE INDEX "lieferposition_bestellposition_id_idx" ON "lieferposition"("bestellposition_id");

-- ---------------------------------------------------------------------------
-- Fremdschlüssel
-- ---------------------------------------------------------------------------

-- AddForeignKey
ALTER TABLE "bestellung" ADD CONSTRAINT "bestellung_betrieb_id_fkey" FOREIGN KEY ("betrieb_id") REFERENCES "betrieb"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bestellposition" ADD CONSTRAINT "bestellposition_betrieb_id_fkey" FOREIGN KEY ("betrieb_id") REFERENCES "betrieb"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bestellposition" ADD CONSTRAINT "bestellposition_bestellung_id_fkey" FOREIGN KEY ("bestellung_id") REFERENCES "bestellung"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bestellposition" ADD CONSTRAINT "bestellposition_artikel_id_fkey" FOREIGN KEY ("artikel_id") REFERENCES "artikel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lieferung" ADD CONSTRAINT "lieferung_bestellung_id_fkey" FOREIGN KEY ("bestellung_id") REFERENCES "bestellung"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lieferung" ADD CONSTRAINT "lieferung_geprueft_von_id_fkey" FOREIGN KEY ("geprueft_von_id") REFERENCES "benutzer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lieferposition" ADD CONSTRAINT "lieferposition_bestellposition_id_fkey" FOREIGN KEY ("bestellposition_id") REFERENCES "bestellposition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leergutposition" ADD CONSTRAINT "leergutposition_betrieb_id_fkey" FOREIGN KEY ("betrieb_id") REFERENCES "betrieb"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leergutposition" ADD CONSTRAINT "leergutposition_lieferung_id_fkey" FOREIGN KEY ("lieferung_id") REFERENCES "lieferung"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abweichung" ADD CONSTRAINT "abweichung_betrieb_id_fkey" FOREIGN KEY ("betrieb_id") REFERENCES "betrieb"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abweichung" ADD CONSTRAINT "abweichung_lieferposition_id_fkey" FOREIGN KEY ("lieferposition_id") REFERENCES "lieferposition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abweichungsereignis" ADD CONSTRAINT "abweichungsereignis_betrieb_id_fkey" FOREIGN KEY ("betrieb_id") REFERENCES "betrieb"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abweichungsereignis" ADD CONSTRAINT "abweichungsereignis_abweichung_id_fkey" FOREIGN KEY ("abweichung_id") REFERENCES "abweichung"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abweichungsereignis" ADD CONSTRAINT "abweichungsereignis_benutzer_id_fkey" FOREIGN KEY ("benutzer_id") REFERENCES "benutzer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Wertebereiche
-- ---------------------------------------------------------------------------

-- Diese Prüfungen kennt das Prisma-Schema nicht; sie stehen nur hier.
--
-- Sie sind an der Rampe kein Formalismus: dort wird mit Richtungen hantiert —
-- Fehlmenge, Überlieferung, Rückgabe, Gutschrift. Eine als negative Menge
-- eingetragene Fehlmenge statt einer Abweichung der Art FEHLMENGE fiele sonst
-- erst auf, wenn sie den Bestand still nach oben gerechnet hat.
--
-- Die älteren Tabellen tragen solche Prüfungen bisher nicht. Sie
-- nachzuziehen ist eine eigene Migration und keine Nebenwirkung dieser hier.

ALTER TABLE "bestellposition"
  ADD CONSTRAINT "bestellposition_anzahl_gebinde_check" CHECK ("anzahl_gebinde" >= 0);

ALTER TABLE "lieferposition"
  ADD CONSTRAINT "lieferposition_anzahl_gebinde_check"
  CHECK ("anzahl_gebinde_lieferschein" >= 0 AND "anzahl_gebinde_tatsaechlich" >= 0);

ALTER TABLE "lieferposition"
  ADD CONSTRAINT "lieferposition_ek_preis_cent_lieferschein_check"
  CHECK ("ek_preis_cent_lieferschein" IS NULL OR "ek_preis_cent_lieferschein" >= 0);

ALTER TABLE "leergutposition"
  ADD CONSTRAINT "leergutposition_anzahl_check"
  CHECK ("anzahl_lieferschein" >= 0 AND "anzahl_tatsaechlich" >= 0);

ALTER TABLE "leergutposition"
  ADD CONSTRAINT "leergutposition_pfand_cent_je_einheit_check"
  CHECK ("pfand_cent_je_einheit" IS NULL OR "pfand_cent_je_einheit" >= 0);

ALTER TABLE "abweichung"
  ADD CONSTRAINT "abweichung_anzahl_gebinde_check" CHECK ("anzahl_gebinde" >= 0);

ALTER TABLE "abweichung"
  ADD CONSTRAINT "abweichung_gutschrift_cent_check"
  CHECK ("gutschrift_cent" IS NULL OR "gutschrift_cent" >= 0);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- Wie in 20260806211836_enable_rls: RLS ohne Policy verweigert jeden Zugriff und
-- hält die neuen Tabellen für `anon` und `authenticated` (Supabase Data API)
-- dicht. Prisma verbindet als Rolle `prisma` mit BYPASSRLS und bleibt unberührt.
-- Policies kommen, sobald der Auth-Weg feststeht.

ALTER TABLE "bestellung" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bestellposition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leergutposition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "abweichung" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "abweichungsereignis" ENABLE ROW LEVEL SECURITY;
