-- AlterTable
ALTER TABLE "WatchSession" ADD COLUMN "avgBitrate" REAL DEFAULT 0;
ALTER TABLE "WatchSession" ADD COLUMN "bufferEvents" INTEGER DEFAULT 0;
ALTER TABLE "WatchSession" ADD COLUMN "bytesDisk" REAL DEFAULT 0;
ALTER TABLE "WatchSession" ADD COLUMN "bytesNetwork" REAL DEFAULT 0;
ALTER TABLE "WatchSession" ADD COLUMN "source" TEXT;
ALTER TABLE "WatchSession" ADD COLUMN "ttff" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "reputationScore" REAL NOT NULL DEFAULT 100,
    "totalUploadBytes" REAL NOT NULL DEFAULT 0,
    "totalDownloadBytes" REAL NOT NULL DEFAULT 0,
    "totalWatchMinutes" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "password", "role", "updatedAt") SELECT "createdAt", "email", "id", "name", "password", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
