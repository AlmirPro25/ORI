-- CreateTable
CREATE TABLE "DownloadQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "magnetURI" TEXT NOT NULL,
    "infoHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "progress" REAL NOT NULL DEFAULT 0,
    "downloadSpeed" REAL NOT NULL DEFAULT 0,
    "uploadSpeed" REAL NOT NULL DEFAULT 0,
    "peers" INTEGER NOT NULL DEFAULT 0,
    "seeds" INTEGER NOT NULL DEFAULT 0,
    "eta" INTEGER,
    "error" TEXT,
    "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "processingTime" INTEGER,
    "totalSize" REAL,
    "fileName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "DownloadQueue_videoId_key" ON "DownloadQueue"("videoId");

-- CreateIndex
CREATE INDEX "DownloadQueue_status_idx" ON "DownloadQueue"("status");

-- CreateIndex
CREATE INDEX "DownloadQueue_priority_idx" ON "DownloadQueue"("priority");

-- CreateIndex
CREATE INDEX "DownloadQueue_queuedAt_idx" ON "DownloadQueue"("queuedAt");
