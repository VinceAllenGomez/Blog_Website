const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const dataDirectory = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '.data');
const dataFile = path.join(dataDirectory, 'blog-data.json');
let pool;
let schemaPromise;

function emptyDatabase() {
  return { accounts: [], posts: [], sessions: [] };
}

function readLocalDatabase() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return emptyDatabase();
  }
}

function saveLocalDatabase(database) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const temporaryFile = `${dataFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(database, null, 2));
  fs.renameSync(temporaryFile, dataFile);
}

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set to use the PostgreSQL database.');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 30000
    });
  }
  return pool;
}

async function ensurePostgresSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const databasePool = getPool();
      await databasePool.query(`
        CREATE TABLE IF NOT EXISTS limima_app_state (
          id TEXT PRIMARY KEY CHECK (id = 'main'),
          state JSONB NOT NULL
        )
      `);
      await databasePool.query(`
        INSERT INTO limima_app_state (id, state)
        VALUES ('main', '{"accounts":[],"posts":[],"sessions":[]}'::jsonb)
        ON CONFLICT (id) DO NOTHING
      `);
    })().catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  await schemaPromise;
}

async function readDatabase() {
  if (!process.env.DATABASE_URL) return readLocalDatabase();

  await ensurePostgresSchema();
  const result = await getPool().query(
    'SELECT state FROM limima_app_state WHERE id = $1',
    ['main']
  );
  if (!result.rows[0]) {
    throw new Error('The PostgreSQL journal state row is missing.');
  }
  return result.rows[0].state;
}

async function updateDatabase(update) {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL must be set in production; local JSON storage is not persistent.');
    }

    const database = readLocalDatabase();
    const result = update(database);
    saveLocalDatabase(database);
    return result;
  }

  await ensurePostgresSchema();
  const client = await getPool().connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    const result = await client.query(
      'SELECT state FROM limima_app_state WHERE id = $1 FOR UPDATE',
      ['main']
    );
    if (!result.rows[0]) {
      throw new Error('The PostgreSQL journal state row is missing.');
    }

    const database = result.rows[0].state;
    const updateResult = update(database);
    await client.query(
      'UPDATE limima_app_state SET state = $1::jsonb WHERE id = $2',
      [JSON.stringify(database), 'main']
    );
    await client.query('COMMIT');
    transactionStarted = false;
    return updateResult;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Unable to roll back the journal database transaction:', rollbackError);
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHash] = storedHash.split(':');
  const actualHash = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  return expected.length === actualHash.length && crypto.timingSafeEqual(expected, actualHash);
}

function publicAccount(account) {
  if (!account) return null;
  const { passwordHash, ...user } = account;
  return user;
}

async function initializeDatabase() {
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
    throw new Error('Set DATABASE_URL to a Neon PostgreSQL connection string before starting in production.');
  }

  await updateDatabase((database) => {
    database.accounts ||= [];
    database.posts ||= [];
    database.sessions ||= [];

    if (!database.accounts.some((account) => account.username.toLowerCase() === 'admin')) {
      const adminPassword = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'ADMIN');
      if (!adminPassword) {
        throw new Error('Set ADMIN_PASSWORD before starting in production.');
      }

      database.accounts.push({
        id: crypto.randomUUID(),
        name: 'Administrator',
        username: 'admin',
        passwordHash: hashPassword(adminPassword),
        profilePicture: '',
        role: 'admin'
      });
    }
  });
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function findUserForToken(token) {
  if (!token) return null;

  const hash = tokenHash(token);
  const database = await readDatabase();
  const session = database.sessions.find((entry) => entry.tokenHash === hash);
  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    await updateDatabase((current) => {
      current.sessions = current.sessions.filter((entry) => entry.tokenHash !== hash);
    });
    return null;
  }

  return publicAccount(database.accounts.find((account) => account.id === session.accountId));
}

async function createSession(account) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  await updateDatabase((database) => {
    database.sessions = database.sessions.filter((session) => session.expiresAt > Date.now());
    database.sessions.push({ id: crypto.randomUUID(), tokenHash: tokenHash(token), accountId: account.id, expiresAt });
  });
  return token;
}

async function deleteSession(token) {
  if (!token) return;
  const hash = tokenHash(token);
  await updateDatabase((database) => {
    database.sessions = database.sessions.filter((session) => session.tokenHash !== hash);
  });
}

module.exports = {
  createSession,
  deleteSession,
  findUserForToken,
  hashPassword,
  initializeDatabase,
  publicAccount,
  readDatabase,
  updateDatabase,
  verifyPassword
};
