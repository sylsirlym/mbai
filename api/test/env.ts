process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://mbai:mbai@localhost:5432/mbai_test';
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
