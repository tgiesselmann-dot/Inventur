-- Lagerorte: die Zählung zerfällt in Abschnitte je Ort.
--
-- Von Hand geschrieben und nicht von `prisma migrate dev` erzeugt. Die neue
-- Spalte `zaehlposition.lagerort_id` ist NOT NULL, und die Tabelle enthält
-- bereits gezählte Zeilen — die Generierung bricht an dieser Stelle ab. Der Weg
-- hier ist der übliche: Spalte nullable anlegen, füllen, dann NOT NULL setzen.
--
-- Die alten Zählungen kannten keinen Ort. Sie wandern deshalb geschlossen in
-- einen Ort namens „Gesamtlager", der genau das aussagt: gezählt wurde alles
-- zusammen. Ihn nachträglich auf „Theke" zu taufen wäre eine Behauptung über
-- Zählungen, die so nie stattgefunden haben. Nach dem Anlegen der echten Lager
-- wird er über `aktiv = false` stillgelegt; seine Zeilen bleiben lesbar.
--
-- Alle Summen bleiben unverändert: der Bestand eines Artikels ist die Summe
-- über seine Orte, und bei einem Ort ist das der alte Wert.

-- CreateTable
CREATE TABLE "lagerort" (
    "id" UUID NOT NULL,
    "betrieb_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "lagerort_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zaehlabschnitt" (
    "id" UUID NOT NULL,
    "betrieb_id" UUID NOT NULL,
    "zaehlung_id" UUID NOT NULL,
    "lagerort_id" UUID NOT NULL,
    "begonnen_am" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "begonnen_von_id" UUID,
    "fertig_am" TIMESTAMPTZ(6),
    "fertig_von_id" UUID,

    CONSTRAINT "zaehlabschnitt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lagerort_betrieb_id_name_key" ON "lagerort"("betrieb_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "zaehlabschnitt_zaehlung_id_lagerort_id_key" ON "zaehlabschnitt"("zaehlung_id", "lagerort_id");

-- CreateIndex
CREATE INDEX "zaehlabschnitt_betrieb_id_idx" ON "zaehlabschnitt"("betrieb_id");

-- CreateIndex
CREATE INDEX "zaehlabschnitt_lagerort_id_idx" ON "zaehlabschnitt"("lagerort_id");

-- CreateIndex
CREATE INDEX "zaehlabschnitt_begonnen_von_id_idx" ON "zaehlabschnitt"("begonnen_von_id");

-- CreateIndex
CREATE INDEX "zaehlabschnitt_fertig_von_id_idx" ON "zaehlabschnitt"("fertig_von_id");

-- AddForeignKey
ALTER TABLE "lagerort" ADD CONSTRAINT "lagerort_betrieb_id_fkey" FOREIGN KEY ("betrieb_id") REFERENCES "betrieb"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zaehlabschnitt" ADD CONSTRAINT "zaehlabschnitt_betrieb_id_fkey" FOREIGN KEY ("betrieb_id") REFERENCES "betrieb"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zaehlabschnitt" ADD CONSTRAINT "zaehlabschnitt_zaehlung_id_fkey" FOREIGN KEY ("zaehlung_id") REFERENCES "zaehlung"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zaehlabschnitt" ADD CONSTRAINT "zaehlabschnitt_lagerort_id_fkey" FOREIGN KEY ("lagerort_id") REFERENCES "lagerort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zaehlabschnitt" ADD CONSTRAINT "zaehlabschnitt_begonnen_von_id_fkey" FOREIGN KEY ("begonnen_von_id") REFERENCES "benutzer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zaehlabschnitt" ADD CONSTRAINT "zaehlabschnitt_fertig_von_id_fkey" FOREIGN KEY ("fertig_von_id") REFERENCES "benutzer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: erst nullable, damit die vorhandenen Zeilen sie bekommen können.
ALTER TABLE "zaehlposition" ADD COLUMN "lagerort_id" UUID;

-- Je Betrieb ein „Gesamtlager" für alles, was vor der Trennung gezählt wurde.
-- Nur für Betriebe, die überhaupt Zählpositionen haben — ein frisch angelegter
-- Betrieb soll nicht mit einem Ort starten, den niemand haben wollte.
--
-- Der Schlüssel kommt aus gen_random_uuid() und ist damit v4 statt v7 wie sonst
-- im Schema. Für diesen einen Datensatz ist das folgenlos: die Anzeige sortiert
-- zwar nach `id`, dieser Ort wird aber stillgelegt und steht dann in keiner
-- Auswahl mehr. Reines SQL kann v7 nicht ohne Bitfummelei erzeugen, und die
-- gehört nicht in eine Migration.
INSERT INTO "lagerort" ("id", "betrieb_id", "name", "aktiv")
SELECT gen_random_uuid(), "betrieb"."id", 'Gesamtlager', true
FROM "betrieb"
WHERE EXISTS (
  SELECT 1 FROM "zaehlposition" WHERE "zaehlposition"."betrieb_id" = "betrieb"."id"
);

-- Alle bisherigen Zählwerte in dieses Lager.
UPDATE "zaehlposition"
SET "lagerort_id" = "lagerort"."id"
FROM "lagerort"
WHERE "lagerort"."betrieb_id" = "zaehlposition"."betrieb_id"
  AND "lagerort"."name" = 'Gesamtlager';

-- Jetzt ist jede Zeile versorgt.
ALTER TABLE "zaehlposition" ALTER COLUMN "lagerort_id" SET NOT NULL;

-- Zu jeder Zählung, die Werte hat, gehört ein Abschnitt an diesem Ort. Diese
-- Invariante — Positionen an einem Ort heisst Abschnitt an diesem Ort — soll
-- auch für die Altdaten gelten, sonst müsste jede Abfrage den Sonderfall
-- „Zählung ohne Abschnitt" mitdenken.
--
-- `fertig_am` bekommen nur abgeschlossene Zählungen: bei ihnen war der Ort
-- nachweislich fertig. Eine offene Altzählung bleibt offen, und ihr einziger
-- Ort will noch fertig gemeldet werden. Die Zeitpunkte stammen aus den
-- Zählwerten selbst und nicht aus dem Moment dieser Migration — sonst sähe eine
-- Zählung vom Juni aus, als sei sie heute Nacht entstanden.
-- `begonnen_von_id` bleibt leer: wer damals gezählt hat, steht nirgends.
INSERT INTO "zaehlabschnitt" (
  "id", "betrieb_id", "zaehlung_id", "lagerort_id",
  "begonnen_am", "begonnen_von_id", "fertig_am", "fertig_von_id"
)
SELECT
  gen_random_uuid(),
  "zaehlung"."betrieb_id",
  "zaehlung"."id",
  "lagerort"."id",
  MIN("zaehlposition"."gezaehlt_am"),
  NULL,
  CASE WHEN "zaehlung"."status" = 'ABGESCHLOSSEN' THEN MAX("zaehlposition"."gezaehlt_am") END,
  NULL
FROM "zaehlung"
JOIN "zaehlposition" ON "zaehlposition"."zaehlung_id" = "zaehlung"."id"
JOIN "lagerort"
  ON "lagerort"."betrieb_id" = "zaehlung"."betrieb_id"
 AND "lagerort"."name" = 'Gesamtlager'
GROUP BY "zaehlung"."id", "zaehlung"."betrieb_id", "zaehlung"."status", "lagerort"."id";

-- DropIndex: ein Artikel darf jetzt mehrfach in einer Zählung stehen — je Ort einmal.
DROP INDEX "zaehlposition_zaehlung_id_artikel_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "zaehlposition_zaehlung_id_lagerort_id_artikel_id_key" ON "zaehlposition"("zaehlung_id", "lagerort_id", "artikel_id");

-- CreateIndex
CREATE INDEX "zaehlposition_lagerort_id_idx" ON "zaehlposition"("lagerort_id");

-- AddForeignKey
ALTER TABLE "zaehlposition" ADD CONSTRAINT "zaehlposition_lagerort_id_fkey" FOREIGN KEY ("lagerort_id") REFERENCES "lagerort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row Level Security auch für die neuen Tabellen. Ohne Policy verweigert sie
-- jeden Zugriff über die Supabase Data API; Prisma verbindet als Rolle `prisma`
-- mit BYPASSRLS und bleibt unberührt. Dieselbe Begründung wie in
-- 20260806211836_enable_rls.
ALTER TABLE "lagerort" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "zaehlabschnitt" ENABLE ROW LEVEL SECURITY;
