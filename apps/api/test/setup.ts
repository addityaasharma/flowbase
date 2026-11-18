import "dotenv/config";
// Tests must never send real email or be throttled.
delete process.env.RESEND_API_KEY;
delete process.env.ALERT_EMAIL;
process.env.DISABLE_RATE_LIMIT = "1";
process.env.NODE_ENV = "test";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to run the API tests (a throw-away Postgres is fine)");
