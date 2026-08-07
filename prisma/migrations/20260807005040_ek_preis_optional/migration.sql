-- Einkaufspreis darf fehlen.
--
-- Im übernommenen Artikelstamm stehen drei Weine ohne EK-Preis; in der Excel
-- blieb die Zelle leer. NULL hält diesen Zustand fest, statt ihn als 0 zu
-- verbuchen: ein Artikel ohne Preis wird gezählt, sein Bestand ist aber nicht
-- bewertbar, und die Auswertung kann das benennen statt still 0 EUR zu melden.

-- AlterTable
ALTER TABLE "artikel" ALTER COLUMN "ek_preis_cent" DROP NOT NULL;

