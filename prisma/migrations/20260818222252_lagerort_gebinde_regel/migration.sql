-- CreateEnum
CREATE TYPE "gebinde_regel" AS ENUM ('GEBINDE_UND_EINZELN', 'NUR_EINZELN', 'NUR_GEBINDE');

-- AlterTable
ALTER TABLE "lagerort" ADD COLUMN     "gebinde_regel" "gebinde_regel" NOT NULL DEFAULT 'GEBINDE_UND_EINZELN';

-- CreateTable
CREATE TABLE "gebindeausnahme" (
    "id" UUID NOT NULL,
    "betrieb_id" UUID NOT NULL,
    "lagerort_id" UUID NOT NULL,
    "artikel_id" UUID NOT NULL,

    CONSTRAINT "gebindeausnahme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gebindeausnahme_betrieb_id_idx" ON "gebindeausnahme"("betrieb_id");

-- CreateIndex
CREATE INDEX "gebindeausnahme_artikel_id_idx" ON "gebindeausnahme"("artikel_id");

-- CreateIndex
CREATE UNIQUE INDEX "gebindeausnahme_lagerort_id_artikel_id_key" ON "gebindeausnahme"("lagerort_id", "artikel_id");

-- AddForeignKey
ALTER TABLE "gebindeausnahme" ADD CONSTRAINT "gebindeausnahme_betrieb_id_fkey" FOREIGN KEY ("betrieb_id") REFERENCES "betrieb"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gebindeausnahme" ADD CONSTRAINT "gebindeausnahme_lagerort_id_fkey" FOREIGN KEY ("lagerort_id") REFERENCES "lagerort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gebindeausnahme" ADD CONSTRAINT "gebindeausnahme_artikel_id_fkey" FOREIGN KEY ("artikel_id") REFERENCES "artikel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row Level Security auch für die neue Tabelle. Ohne Policy verweigert sie
-- jeden Zugriff über die Supabase Data API; Prisma verbindet als Rolle `prisma`
-- mit BYPASSRLS und bleibt unberührt. Dieselbe Begründung wie in
-- 20260806211836_enable_rls.
ALTER TABLE "gebindeausnahme" ENABLE ROW LEVEL SECURITY;
