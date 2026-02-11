-- CreateTable
CREATE TABLE "PlaybackHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastTime" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlaybackHistory_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaybackHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PlaybackHistory_videoId_userId_key" ON "PlaybackHistory"("videoId", "userId");
