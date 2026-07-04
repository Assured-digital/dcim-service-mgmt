-- Floor plan Phase A: true-scale cabinet footprints. Physical dimensions (mm);
-- null falls back to a standard 600 × 1070 mm cabinet on the canvas.
ALTER TABLE "Cabinet" ADD COLUMN "widthMm" INTEGER;
ALTER TABLE "Cabinet" ADD COLUMN "depthMm" INTEGER;
