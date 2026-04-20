-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Instructor" (
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
    "studioNameRaw" TEXT,
    "sourceUrl" TEXT,
    "detailsFetchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Instructor_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Instructor" ("address", "bio", "classTypes", "createdAt", "dedupKey", "email", "fullName", "id", "instagramHandle", "linkedinUrl", "normalizedName", "phone", "photoUrl", "sourceUrl", "studioId", "studioNameRaw", "updatedAt", "workZipcode") SELECT "address", "bio", "classTypes", "createdAt", "dedupKey", "email", "fullName", "id", "instagramHandle", "linkedinUrl", "normalizedName", "phone", "photoUrl", "sourceUrl", "studioId", "studioNameRaw", "updatedAt", "workZipcode" FROM "Instructor";
DROP TABLE "Instructor";
ALTER TABLE "new_Instructor" RENAME TO "Instructor";
CREATE UNIQUE INDEX "Instructor_dedupKey_key" ON "Instructor"("dedupKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
