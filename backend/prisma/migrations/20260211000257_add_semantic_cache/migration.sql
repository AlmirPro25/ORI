-- CreateTable
CREATE TABLE "SemanticCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "term" TEXT NOT NULL,
    "tmdbId" INTEGER,
    "mediaType" TEXT,
    "titlePt" TEXT,
    "titleEn" TEXT,
    "originalTitle" TEXT,
    "year" TEXT,
    "posterPath" TEXT,
    "backdropPath" TEXT,
    "overview" TEXT,
    "voteAverage" REAL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "SemanticCache_term_key" ON "SemanticCache"("term");

-- CreateIndex
CREATE INDEX "SemanticCache_term_idx" ON "SemanticCache"("term");
