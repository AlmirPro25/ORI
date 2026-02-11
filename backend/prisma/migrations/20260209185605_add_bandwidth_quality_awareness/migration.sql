-- AlterTable
ALTER TABLE "Video" ADD COLUMN "fileSize" REAL;
ALTER TABLE "Video" ADD COLUMN "quality" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "preferredGenres" TEXT,
    "avgSessionTime" REAL NOT NULL DEFAULT 0,
    "completionRate" REAL NOT NULL DEFAULT 0,
    "preferredQuality" TEXT NOT NULL DEFAULT '1080p',
    "avgBandwidth" REAL NOT NULL DEFAULT 0,
    "lastActive" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_UserProfile" ("avgSessionTime", "completionRate", "id", "lastActive", "preferredGenres", "updatedAt", "userId") SELECT "avgSessionTime", "completionRate", "id", "lastActive", "preferredGenres", "updatedAt", "userId" FROM "UserProfile";
DROP TABLE "UserProfile";
ALTER TABLE "new_UserProfile" RENAME TO "UserProfile";
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");
CREATE INDEX "UserProfile_userId_idx" ON "UserProfile"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
