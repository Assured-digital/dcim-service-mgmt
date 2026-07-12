-- C1 — site-per-client SharePoint. Each client gets its own SharePoint site
-- (Graph site id); its Documents (shared) + Evidence (internal) libraries hold
-- the client's documents. Additive + nullable; dormant until GRAPH_ENABLED.
ALTER TABLE "Client" ADD COLUMN "sharePointSiteId" TEXT;
