/*
  Warnings:

  - You are about to drop the column `hasPortuguese` on the `Video` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Video" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Geral',
    "originalFilename" TEXT NOT NULL,
    "storageKey" TEXT,
    "hlsPath" TEXT,
    "thumbnailPath" TEXT,
    "tags" TEXT,
    "duration" REAL,
    "quality" TEXT,
    "fileSize" REAL,
    "hlsSizeMB" REAL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "isPredictive" BOOLEAN NOT NULL DEFAULT false,
    "audioTracks" TEXT,
    "subtitleTracks" TEXT,
    "hasDubbed" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "tmdbId" TEXT,
    "imdbId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Video_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Video" ("audioTracks", "category", "createdAt", "description", "duration", "fileSize", "hasDubbed", "hlsPath", "hlsSizeMB", "id", "isPredictive", "lastViewedAt", "originalFilename", "quality", "status", "storageKey", "subtitleTracks", "tags", "thumbnailPath", "title", "updatedAt", "userId", "views") SELECT "audioTracks", "category", "createdAt", "description", "duration", "fileSize", "hasDubbed", "hlsPath", "hlsSizeMB", "id", "isPredictive", "lastViewedAt", "originalFilename", "quality", "status", "storageKey", "subtitleTracks", "tags", "thumbnailPath", "title", "updatedAt", "userId", "views" FROM "Video";
DROP TABLE "Video";
ALTER TABLE "new_Video" RENAME TO "Video";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
