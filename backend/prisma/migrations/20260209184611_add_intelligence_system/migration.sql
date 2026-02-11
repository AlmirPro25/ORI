-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorite_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WatchSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "startTime" REAL NOT NULL,
    "endTime" REAL NOT NULL,
    "duration" REAL NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "abandoned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SwarmHealth" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentHash" TEXT NOT NULL,
    "videoId" TEXT,
    "peers" INTEGER NOT NULL DEFAULT 0,
    "seeds" INTEGER NOT NULL DEFAULT 0,
    "avgSpeed" REAL NOT NULL DEFAULT 0,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "healthScore" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ContentStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "views24h" INTEGER NOT NULL DEFAULT 0,
    "viewsTotal" INTEGER NOT NULL DEFAULT 0,
    "completionRate" REAL NOT NULL DEFAULT 0,
    "avgWatchTime" REAL NOT NULL DEFAULT 0,
    "trendingScore" REAL NOT NULL DEFAULT 0,
    "recommendScore" REAL NOT NULL DEFAULT 0,
    "lastCalculated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "preferredGenres" TEXT,
    "avgSessionTime" REAL NOT NULL DEFAULT 0,
    "completionRate" REAL NOT NULL DEFAULT 0,
    "lastActive" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_videoId_userId_key" ON "Favorite"("videoId", "userId");

-- CreateIndex
CREATE INDEX "WatchSession_videoId_idx" ON "WatchSession"("videoId");

-- CreateIndex
CREATE INDEX "WatchSession_userId_idx" ON "WatchSession"("userId");

-- CreateIndex
CREATE INDEX "WatchSession_createdAt_idx" ON "WatchSession"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SwarmHealth_contentHash_key" ON "SwarmHealth"("contentHash");

-- CreateIndex
CREATE INDEX "SwarmHealth_contentHash_idx" ON "SwarmHealth"("contentHash");

-- CreateIndex
CREATE INDEX "SwarmHealth_healthScore_idx" ON "SwarmHealth"("healthScore");

-- CreateIndex
CREATE UNIQUE INDEX "ContentStats_videoId_key" ON "ContentStats"("videoId");

-- CreateIndex
CREATE INDEX "ContentStats_recommendScore_idx" ON "ContentStats"("recommendScore");

-- CreateIndex
CREATE INDEX "ContentStats_trendingScore_idx" ON "ContentStats"("trendingScore");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE INDEX "UserProfile_userId_idx" ON "UserProfile"("userId");
