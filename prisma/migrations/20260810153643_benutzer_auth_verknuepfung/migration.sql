-- AlterTable
ALTER TABLE "benutzer" ADD COLUMN     "angelegt_am" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "auth_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "benutzer_auth_id_key" ON "benutzer"("auth_id");

