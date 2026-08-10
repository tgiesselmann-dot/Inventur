-- Kassenimport: Zuordnung mit mehreren Bestandteilen, Abrechnungsart am Umsatz.
--
-- Zwei Änderungen, die beide daher rühren, dass das Modell dem Kassenexport
-- bisher zu wenig zugetraut hat:
--
-- 1. Ein Kassenartikel zeigte auf genau einen Lagerartikel. Ein Aperol Spritz
--    nimmt aber Aperol *und* Prosecco, ein Krefelder Fassbier *und* Cola. Der
--    jeweils zweite Artikel fehlte in der Verkaufsmenge und erschien am
--    Monatsende als Schwund. Die Zuordnung wird deshalb zu einer eigenen
--    Tabelle: eine Zeile je verbrauchtem Artikel.
--
-- 2. Die Umsatzposition kannte nur eine Menge. Der Export unterscheidet aber
--    Bar, Karte, Debitor, Gutschein, Promotion und Bruch. Alle nehmen Ware aus
--    dem Lager, nur ein Teil davon ist Verkauf. Ohne die Abrechnungsart ist ein
--    ordentlich gebuchter Bruch nach dem Import nicht mehr von einem Verkauf zu
--    unterscheiden.

-- ---------------------------------------------------------------------------
-- Kassenartikel: aus dem Artikelverweis wird eine eigene Tabelle
-- ---------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "kassenartikelbestandteil" (
    "id" UUID NOT NULL,
    "betrieb_id" UUID NOT NULL,
    "kassenartikel_id" UUID NOT NULL,
    "artikel_id" UUID NOT NULL,
    "einheiten_pro_verkauf" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "kassenartikelbestandteil_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kassenartikelbestandteil_kassenartikel_id_artikel_id_key"
    ON "kassenartikelbestandteil"("kassenartikel_id", "artikel_id");

-- CreateIndex
CREATE INDEX "kassenartikelbestandteil_betrieb_id_idx" ON "kassenartikelbestandteil"("betrieb_id");

-- CreateIndex
CREATE INDEX "kassenartikelbestandteil_artikel_id_idx" ON "kassenartikelbestandteil"("artikel_id");

-- AddForeignKey
ALTER TABLE "kassenartikelbestandteil" ADD CONSTRAINT "kassenartikelbestandteil_betrieb_id_fkey"
    FOREIGN KEY ("betrieb_id") REFERENCES "betrieb"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kassenartikelbestandteil" ADD CONSTRAINT "kassenartikelbestandteil_kassenartikel_id_fkey"
    FOREIGN KEY ("kassenartikel_id") REFERENCES "kassenartikel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kassenartikelbestandteil" ADD CONSTRAINT "kassenartikelbestandteil_artikel_id_fkey"
    FOREIGN KEY ("artikel_id") REFERENCES "artikel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bestehende Zuordnungen übernehmen, bevor die Spalten verschwinden. uuidv7()
-- gibt es in Postgres erst ab 18; die id kommt deshalb aus gen_random_uuid().
-- Für eine Handvoll bereits zugeordneter Zeilen ist die fehlende Zeitordnung
-- des Index folgenlos, und neue Zeilen schreibt Prisma wieder als UUIDv7.
INSERT INTO "kassenartikelbestandteil" (
    "id", "betrieb_id", "kassenartikel_id", "artikel_id", "einheiten_pro_verkauf"
)
SELECT gen_random_uuid(), "betrieb_id", "id", "artikel_id", "einheiten_pro_verkauf"
FROM "kassenartikel"
WHERE "artikel_id" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "kassenartikel" DROP CONSTRAINT "kassenartikel_artikel_id_fkey";

-- DropIndex
DROP INDEX "kassenartikel_artikel_id_idx";

-- AlterTable
ALTER TABLE "kassenartikel"
    DROP COLUMN "artikel_id",
    DROP COLUMN "einheiten_pro_verkauf",
    ADD COLUMN "notiz" TEXT;

-- ---------------------------------------------------------------------------
-- Umsatz: Abrechnungsart und Importzeitpunkt
-- ---------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "umsatzimport"
    ADD COLUMN "importiert_am" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
--
-- Der Vorgabewert steht nur für die Dauer dieser Migration da: vorhandene Zeilen
-- stammen aus der Zeit vor dem Import und ihre Abrechnungsart ist nicht mehr zu
-- ermitteln. "unbekannt" sagt das; eine erfundene "Bar"-Buchung wäre eine
-- stillschweigende Behauptung. Danach fällt der Vorgabewert weg, damit jede neue
-- Zeile ihre Art mitbringen muss.
ALTER TABLE "umsatzposition" ADD COLUMN "abrechnungsart" TEXT NOT NULL DEFAULT 'unbekannt';
ALTER TABLE "umsatzposition" ALTER COLUMN "abrechnungsart" DROP DEFAULT;

-- DropIndex
--
-- Wird vom neuen Unique-Index abgedeckt: dessen führende Spalte ist dieselbe.
DROP INDEX "umsatzposition_umsatzimport_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "umsatzposition_umsatzimport_id_pos_bezeichnung_abrechnungsa_key"
    ON "umsatzposition"("umsatzimport_id", "pos_bezeichnung", "abrechnungsart");

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- Wie bei allen Tabellen in `public`: RLS an, keine Policy. Ohne Policy
-- verweigert RLS jeden Zugriff, die Tabelle ist damit für `anon` und
-- `authenticated` über die Supabase Data API dicht. Prisma verbindet als Rolle
-- `prisma` mit BYPASSRLS und bleibt unberührt.

ALTER TABLE "kassenartikelbestandteil" ENABLE ROW LEVEL SECURITY;
