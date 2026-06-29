// Env required before the Nest module graph is instantiated. JwtStrategy reads
// process.env.JWT_SECRET in its constructor (at module compile time), so it must be
// set before the app boots. No real DB/storage is contacted — PrismaService is
// overridden with a no-op in the test.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-secret";
process.env.STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || "s3";
