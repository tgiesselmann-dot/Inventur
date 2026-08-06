-- Row Level Security auf allen Tabellen im Schema `public` aktivieren.
--
-- Bewusst ohne Policies: RLS ohne Policy verweigert jeden Zugriff. Damit sind die
-- Tabellen für `anon` und `authenticated` (Supabase Data API / PostgREST) dicht,
-- auch falls jemand später versehentlich GRANTs vergibt.
--
-- Die App bleibt unberührt: Prisma verbindet als Rolle `prisma`, die BYPASSRLS
-- besitzt und ausserdem Eigentümerin dieser Tabellen ist.
--
-- FORCE ROW LEVEL SECURITY wird nicht gesetzt. Es unterwirft nur den Eigentümer
-- den Policies; BYPASSRLS sticht es ohnehin, es brächte hier also keinen Schutz.
--
-- Sobald der Auth-Weg feststeht (Zuordnung auth.users -> benutzer -> betrieb),
-- kommen die Policies in einer eigenen Migration dazu. Sie sollten
-- `(select auth.uid())` verwenden, damit die Funktion einmal statt je Zeile
-- ausgewertet wird.

ALTER TABLE "betrieb" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "benutzer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "artikel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kassenartikel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "zaehlung" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "zaehlposition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lieferung" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lieferposition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "umsatzimport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "umsatzposition" ENABLE ROW LEVEL SECURITY;

-- Prismas eigene Verwaltungstabelle. Gehört nicht zum Datenmodell, liegt aber im
-- selben Schema und wird sonst vom Supabase Security Advisor bemängelt.
-- Die Prüfung ist nötig, weil die Shadow-Datenbank diese Tabelle nicht hat.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
