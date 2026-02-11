-- CreateTable
CREATE TABLE "SeedState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "infoHash" TEXT NOT NULL,
    "magnetURI" TEXT NOT NULL,
    "seedUntil" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SystemStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "valueFloat" REAL,
    "valueInt" INTEGER,
    "valueString" TEXT,
    "updatedAt" DATETIME NOT NULL
);

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
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Video_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Video" ("category", "createdAt", "description", "duration", "fileSize", "hlsPath", "id", "originalFilename", "quality", "status", "storageKey", "tags", "thumbnailPath", "title", "updatedAt", "userId", "views") SELECT "category", "createdAt", "description", "duration", "fileSize", "hlsPath", "id", "originalFilename", "quality", "status", "storageKey", "tags", "thumbnailPath", "title", "updatedAt", "userId", "views" FROM "Video";
DROP TABLE "Video";
ALTER TABLE "new_Video" RENAME TO "Video";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SeedState_videoId_key" ON "SeedState"("videoId");

-- CreateIndex
CREATE INDEX "SeedState_seedUntil_idx" ON "SeedState"("seedUntil");

-- CreateIndex
CREATE INDEX "SeedState_isActive_idx" ON "SeedState"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SystemStats_key_key" ON "SystemStats"("key");
