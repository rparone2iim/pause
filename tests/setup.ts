// Every test starts with a complete, valid configuration (src/lib/env.ts refuses to start without one).
// Integration tests use the real database given by DATABASE_URL; the others never open a connection.
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/never-used";
process.env.JWT_SECRET ??= "test-only-secret-0123456789-0123456789-abcdef";
process.env.APP_ORIGIN ??= "http://localhost:3000";
process.env.UPLOAD_DIR ??= "/tmp/pause-test-uploads";
process.env.LOG_LEVEL ??= "error"; // keep the test output readable
// The AI is never called for real in tests: a fake Gemini answers (see tests/unit/assistant.test.ts).
delete process.env.VERTEX_PROJECT;
delete process.env.VERTEX_ACCESS_TOKEN;
