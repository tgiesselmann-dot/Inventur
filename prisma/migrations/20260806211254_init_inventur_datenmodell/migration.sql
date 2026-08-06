-- CreateEnum
CREATE TYPE "einheit" AS ENUM ('FLASCHE', 'FASS', 'LITER');

-- CreateEnum
CREATE TYPE "zaehlung_status" AS ENUM ('OFFEN', 'ABGESCHLOSSEN');

-- CreateTable
CREATE TABLE "betrieb" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "angelegt_am" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "betrieb_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benutzer" (
    "id" UUID NOT NULL,
    "betrieb_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "rolle" TEXT NOT NULL,

    CONSTRAINT "benutzer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artikel" (
    "id" UUID NOT NULL,
    "betrieb_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "gebinde_text" TEXT NOT NULL,
    "packungsgroesse" INTEGER NOT NULL,
    "einheit" "einheit" NOT NULL,
    "ek_preis_gebinde_cent" INTEGER NOT NULL,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "kategorie" TEXT NOT NULL,
    "sortierung" INTEGER NOT NULL,

    CONSTRAINT "artikel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kassenartikel" (
    "id" UUID NOT NULL,
    "betrieb_id" UUID NOT NULL,
    "pos_bezeichnung" TEXT NOT NULL,
    "artikel_id" UUID,
    "einheiten_pro_verkauf" DECIMAL(10,3) NOT NULL,
    "bestaetigt" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "kassenartikel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zaehlung" (
    "id" UUID NOT NULL,
    "betrieb_id" UUID NOT NULL,
    "datum" DATE NOT NULL,
    "status" "zaehlung_status" NOT NULL DEFAULT 'OFFEN',

    CONSTRAINT "zaehlung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zaehlposition" (
    "id" UUID NOT NULL,
    "betrieb_id" UUID NOT NULL,
    "zaehlung_id" UUID NOT NULL,
    "artikel_id" UUID NOT NULL,
    "anzahl_gebinde" DECIMAL(10,2) NOT NULL,
    "anzahl_flaschen" DECIMAL(10,2) NOT NULL,
    "gezaehlt_am" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zaehlposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lieferung" (
    "id" UUID NOT NULL,
    "betrieb_id" UUID NOT NULL,
    "datum" DATE NOT NULL,
    "lieferant" TEXT NOT NULL,
    "beleg_nr" TEXT NOT NULL,

    CONSTRAINT "lieferung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lieferposition" (
    "id" UUID NOT NULL,
    "betrieb_id" UUID NOT NULL,
    "lieferung_id" UUID NOT NULL,
    "artikel_id" UUID NOT NULL,
    "anzahl_gebinde" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "lieferposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "umsatzimport" (
    "id" UUID NOT NULL,
    "betrieb_id" UUID NOT NULL,
    "zeitraum_von" TIMESTAMPTZ(6) NOT NULL,
    "zeitraum_bis" TIMESTAMPTZ(6) NOT NULL,
    "dateiname" TEXT NOT NULL,

    CONSTRAINT "umsatzimport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "umsatzposition" (
    "id" UUID NOT NULL,
    "betrieb_id" UUID NOT NULL,
    "umsatzimport_id" UUID NOT NULL,
    "pos_bezeichnung" TEXT NOT NULL,
    "menge" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "umsatzposition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "benutzer_email_key" ON "benutzer"("email");

-- CreateIndex
CREATE INDEX "benutzer_betrieb_id_idx" ON "benutzer"("betrieb_id");

-- CreateIndex
CREATE INDEX "artikel_betrieb_id_aktiv_sortierung_idx" ON "artikel"("betrieb_id", "aktiv", "sortierung");

-- CreateIndex
CREATE INDEX "kassenartikel_artikel_id_idx" ON "kassenartikel"("artikel_id");

-- CreateIndex
CREATE UNIQUE INDEX "kassenartikel_betrieb_id_pos_bezeichnung_key" ON "kassenartikel"("betrieb_id", "pos_bezeichnung");

-- CreateIndex
CREATE INDEX "zaehlung_betrieb_id_datum_idx" ON "zaehlung"("betrieb_id", "datum");

-- CreateIndex
CREATE INDEX "zaehlposition_betrieb_id_idx" ON "zaehlposition"("betrieb_id");

-- CreateIndex
CREATE INDEX "zaehlposition_artikel_id_idx" ON "zaehlposition"("artikel_id");

-- CreateIndex
CREATE UNIQUE INDEX "zaehlposition_zaehlung_id_artikel_id_key" ON "zaehlposition"("zaehlung_id", "artikel_id");

-- CreateIndex
CREATE INDEX "lieferung_betrieb_id_datum_idx" ON "lieferung"("betrieb_id", "datum");

-- CreateIndex
CREATE INDEX "lieferposition_betrieb_id_idx" ON "lieferposition"("betrieb_id");

-- CreateIndex
CREATE INDEX "lieferposition_lieferung_id_idx" ON "lieferposition"("lieferung_id");

-- CreateIndex
CREATE INDEX "lieferposition_artikel_id_idx" ON "lieferposition"("artikel_id");

-- CreateIndex
CREATE INDEX "umsatzimport_betrieb_id_zeitraum_von_idx" ON "umsatzimport"("betrieb_id", "zeitraum_von");

-- CreateIndex
CREATE INDEX "umsatzposition_betrieb_id_idx" ON "umsatzposition"("betrieb_id");

-- CreateIndex
CREATE INDEX "umsatzposition_umsatzimport_id_idx" ON "umsatzposition"("umsatzimport_id");

-- AddForeignKey
ALTER TABLE "benutzer" ADD CONSTRAINT "benutzer_betrieb_id_fkey" FOREIGN KEY ("betrieb_id") REFERENCES "betrieb"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artikel" ADD CONSTRAINT "artikel_betrieb_id_fkey" FOREIGN KEY ("betrieb_id") REFERENCES "betrieb"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kassenartikel" ADD CONSTRAINT "kassenartikel_betrieb_id_fkey" FOREIGN KEY ("betrieb_id") REFERENCES "betrieb"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kassenartikel" ADD CONSTRAINT "kassenartikel_artikel_id_fkey" FOREIGN KEY ("artikel_id") REFERENCES "artikel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zaehlung" ADD CONSTRAINT "zaehlung_betrieb_id_fkey" FOREIGN KEY ("betrieb_id") REFERENCES "betrieb"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zaehlposition" ADD CONSTRAINT "zaehlposition_betrieb_id_fkey" FOREIGN KEY ("betrieb_id") REFERENCES "betrieb"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zaehlposition" ADD CONSTRAINT "zaehlposition_zaehlung_id_fkey" FOREIGN KEY ("zaehlung_id") REFERENCES "zaehlung"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zaehlposition" ADD CONSTRAINT "zaehlposition_artikel_id_fkey" FOREIGN KEY ("artikel_id") REFERENCES "artikel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lieferung" ADD CONSTRAINT "lieferung_betrieb_id_fkey" FOREIGN KEY ("betrieb_id") REFERENCES "betrieb"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lieferposition" ADD CONSTRAINT "lieferposition_betrieb_id_fkey" FOREIGN KEY ("betrieb_id") REFERENCES "betrieb"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lieferposition" ADD CONSTRAINT "lieferposition_lieferung_id_fkey" FOREIGN KEY ("lieferung_id") REFERENCES "lieferung"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lieferposition" ADD CONSTRAINT "lieferposition_artikel_id_fkey" FOREIGN KEY ("artikel_id") REFERENCES "artikel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "umsatzimport" ADD CONSTRAINT "umsatzimport_betrieb_id_fkey" FOREIGN KEY ("betrieb_id") REFERENCES "betrieb"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "umsatzposition" ADD CONSTRAINT "umsatzposition_betrieb_id_fkey" FOREIGN KEY ("betrieb_id") REFERENCES "betrieb"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "umsatzposition" ADD CONSTRAINT "umsatzposition_umsatzimport_id_fkey" FOREIGN KEY ("umsatzimport_id") REFERENCES "umsatzimport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
