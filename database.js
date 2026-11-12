const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const dataDirectory = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '.data');
const dataFile = path.join(dataDirectory, 'blog-data.json');

function readDatabase() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { accounts: [], posts: [], sessions: [] };
  }
}

function saveDatabase(database) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const temporaryFile = `${dataFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(database, null, 2));
  fs.renameSync(temporaryFile, dataFile);
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

function initializeDatabase() {
  const database = readDatabase();
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

  saveDatabase(database);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function findUserForToken(token) {
  if (!token) return null;

  const database = readDatabase();
  const hash = tokenHash(token);
  const session = database.sessions.find((entry) => entry.tokenHash === hash);
  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    database.sessions = database.sessions.filter((entry) => entry.tokenHash !== hash);
    saveDatabase(database);
    return null;
  }

  return publicAccount(database.accounts.find((account) => account.id === session.accountId));
}

function createSession(account) {
  const database = readDatabase();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  database.sessions = database.sessions.filter((session) => session.expiresAt > Date.now());
  database.sessions.push({ tokenHash: tokenHash(token), accountId: account.id, expiresAt });
  saveDatabase(database);
  return token;
}

function deleteSession(token) {
  if (!token) return;
  const database = readDatabase();
  const hash = tokenHash(token);
  database.sessions = database.sessions.filter((session) => session.tokenHash !== hash);
  saveDatabase(database);
}

module.exports = {
  createSession,
  deleteSession,
  findUserForToken,
  hashPassword,
  initializeDatabase,
  publicAccount,
  readDatabase,
  saveDatabase,
  verifyPassword
};