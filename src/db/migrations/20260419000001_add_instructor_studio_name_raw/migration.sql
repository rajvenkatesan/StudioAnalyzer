-- Add studioNameRaw to store the scraped studio name directly,
-- independent of the studioId FK (which may be null when the MindBody
-- studio isn't yet in the studios DB).
ALTER TABLE "Instructor" ADD COLUMN "studioNameRaw" TEXT;
