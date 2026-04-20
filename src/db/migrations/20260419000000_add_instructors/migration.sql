-- CreateTable
CREATE TABLE "Instructor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dedupKey" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "studioId" INTEGER,
    "workZipcode" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "instagramHandle" TEXT,
    "linkedinUrl" TEXT,
    "bio" TEXT,
    "address" TEXT,
    "photoUrl" TEXT,
    "classTypes" TEXT,
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Instructor_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Instructor_dedupKey_key" ON "Instructor"("dedupKey");
