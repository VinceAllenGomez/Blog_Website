const express = require('express');
const path = require('path');
const { json, urlencoded } = require('./body-parser');
const crypto = require('crypto');
const {
  createSession,
  deleteSession,
  findUserForToken,
  hashPassword,
  publicAccount,
  readDatabase,
  saveDatabase,
  verifyPassword
} = require('./database');

const app = express();
const sessionCookie = 'limima_session';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(json);
app.use(urlencoded);

const frontendOrigin = process.env.FRONTEND_ORIGIN;

function getCookie(req, name) {
  const cookie = (req.headers.cookie || '').split(';').find((part) => part.trim().startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.trim().slice(name.length + 1)) : '';
}

function setSessionCookie(res, token) {
  const production = process.env.NODE_ENV === 'production';
  const secure = production ? '; Secure' : '';
  const sameSite = production ? 'None' : 'Lax';
  res.setHeader('Set-Cookie', `${sessionCookie}=${encodeURIComponent(token)}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=604800${secure}`);
}

function clearSessionCookie(res) {
  const production = process.env.NODE_ENV === 'production';
  const secure = production ? '; Secure' : '';
  const sameSite = production ? 'None' : 'Lax';
  res.setHeader('Set-Cookie', `${sessionCookie}=; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=0${secure}`);
}

function isAdmin(user) {
  return !!user && user.role === 'admin';
}

app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && frontendOrigin && origin === frontendOrigin) {
    res.setHeader('Access-Control-Allow-Origin', frontendOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(origin && frontendOrigin && origin === frontendOrigin ? 204 : 403);
  }
  req.sessionToken = getCookie(req, sessionCookie);
  req.user = findUserForToken(req.sessionToken);
  next();
});

app.get('/api/session', (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/register', (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const username = typeof req.body.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const profilePicture = typeof req.body.profilePicture === 'string' ? req.body.profilePicture : '';

  if (!name || username.length < 3 || !password) {
    return res.status(400).json({ error: 'Enter a name, a username of at least 3 characters, and a password.' });
  }

  const database = readDatabase();
  if (database.accounts.some((account) => account.username.toLowerCase() === username)) {
    return res.status(409).json({ error: 'This username is already taken.' });
  }

  const account = {
    id: crypto.randomUUID(),
    name,
    username,
    passwordHash: hashPassword(password),
    profilePicture,
    role: 'user'
  };
  database.accounts.push(account);
  saveDatabase(database);
  setSessionCookie(res, createSession(account));
  return res.status(201).json({ user: publicAccount(account) });
});

app.post('/api/login', (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const account = readDatabase().accounts.find((entry) => entry.username.toLowerCase() === username);

  if (!account || !verifyPassword(password, account.passwordHash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  setSessionCookie(res, createSession(account));
  return res.json({ user: publicAccount(account) });
});

app.delete('/api/session', (req, res) => {
  deleteSession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/posts', (req, res) => {
  const database = readDatabase();
  const posts = database.posts
    .map((post) => {
      const author = database.accounts.find((account) => account.id === post.authorId);
      const publicPost = { ...post };
      delete publicPost.deleteTokenHash;
      const comments = (Array.isArray(post.comments) ? post.comments : []).map((comment) => {
        const publicComment = { ...comment };
        delete publicComment.deleteTokenHash;
        return publicComment;
      });
      return {
        ...publicPost,
        comments,
        profilePicture: author ? author.profilePicture : '',
        canDelete: isAdmin(req.user) || !!(req.user && post.authorId === req.user.id)
      };
    })
    .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
  res.json({ posts });
});

app.post('/api/posts', (req, res) => {
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  const authorName = typeof req.body.authorName === 'string' ? req.body.authorName.trim() : '';
  if (!content) {
    return res.status(400).json({ error: 'Enter something to share.' });
  }
  if (authorName.length > 40) {
    return res.status(400).json({ error: 'Names must be 40 characters or fewer.' });
  }

  const database = readDatabase();
  const post = {
    id: crypto.randomUUID(),
    ...(req.user ? { authorId: req.user.id } : {}),
    authorName: authorName || 'Guest',
    content,
    createdAt: new Date().toISOString(),
    comments: []
  };
  const deletionToken = req.user ? '' : crypto.randomBytes(32).toString('hex');
  if (deletionToken) {
    post.deleteTokenHash = crypto.createHash('sha256').update(deletionToken).digest('hex');
  }
  database.posts.push(post);
  saveDatabase(database);
  res.status(201).json({ post, ...(deletionToken ? { deletionToken } : {}) });
});

app.post('/api/posts/:id/comments', (req, res) => {
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  const authorName = typeof req.body.authorName === 'string' ? req.body.authorName.trim() : '';
  if (!content) {
    return res.status(400).json({ error: 'Enter something to comment.' });
  }
  if (authorName.length > 40) {
    return res.status(400).json({ error: 'Names must be 40 characters or fewer.' });
  }

  const database = readDatabase();
  const post = database.posts.find((entry) => entry.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  post.comments ||= [];
  const comment = {
    id: crypto.randomUUID(),
    authorName: authorName || 'Guest',
    content,
    createdAt: new Date().toISOString()
  };
  const deletionToken = crypto.randomBytes(32).toString('hex');
  comment.deleteTokenHash = crypto.createHash('sha256').update(deletionToken).digest('hex');
  post.comments.push(comment);
  saveDatabase(database);
  res.status(201).json({ comment: { ...comment, deleteTokenHash: undefined }, deletionToken });
});

app.delete('/api/posts/:id/comments/:commentId', (req, res) => {
  const database = readDatabase();
  const post = database.posts.find((entry) => entry.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const comment = (post.comments || []).find((entry) => entry.id === req.params.commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found.' });

  const canDeleteAsUser = !!req.user && (post.authorId === req.user.id || isAdmin(req.user));
  const suppliedToken = typeof req.body.deleteToken === 'string' ? req.body.deleteToken : '';
  const suppliedHash = suppliedToken
    ? crypto.createHash('sha256').update(suppliedToken).digest('hex')
    : '';
  const canDeleteWithToken = !!comment.deleteTokenHash
    && suppliedHash.length === comment.deleteTokenHash.length
    && crypto.timingSafeEqual(Buffer.from(suppliedHash, 'hex'), Buffer.from(comment.deleteTokenHash, 'hex'));
  if (!canDeleteAsUser && !canDeleteWithToken) {
    return res.status(403).json({ error: 'You can only delete your own comments.' });
  }

  post.comments = post.comments.filter((entry) => entry.id !== comment.id);
  saveDatabase(database);
  res.json({ ok: true });
});

app.delete('/api/posts/:id', (req, res) => {
  const database = readDatabase();
  const post = database.posts.find((entry) => entry.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const canDeleteAsUser = !!req.user && (post.authorId === req.user.id || isAdmin(req.user));
  const suppliedToken = typeof req.body.deleteToken === 'string' ? req.body.deleteToken : '';
  const suppliedHash = suppliedToken
    ? crypto.createHash('sha256').update(suppliedToken).digest('hex')
    : '';
  const canDeleteWithToken = !!post.deleteTokenHash
    && suppliedHash.length === post.deleteTokenHash.length
    && crypto.timingSafeEqual(Buffer.from(suppliedHash, 'hex'), Buffer.from(post.deleteTokenHash, 'hex'));
  if (!canDeleteAsUser && !canDeleteWithToken) {
    return res.status(403).json({ error: 'You can only delete your own posts.' });
  }

  database.posts = database.posts.filter((entry) => entry.id !== post.id);
  saveDatabase(database);
  res.json({ ok: true });
});

app.get('/api/accounts', (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only admin can manage accounts.' });
  const accounts = readDatabase().accounts
    .filter((account) => account.id !== req.user.id)
    .map(publicAccount);
  res.json({ accounts });
});

app.delete('/api/accounts/:id', (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only admin can delete accounts.' });
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Admin cannot delete its own account.' });
  }

  const database = readDatabase();
  const exists = database.accounts.some((account) => account.id === req.params.id);
  if (!exists) return res.status(404).json({ error: 'Account not found.' });
  database.accounts = database.accounts.filter((account) => account.id !== req.params.id);
  database.posts = database.posts.filter((post) => post.authorId !== req.params.id);
  database.sessions = database.sessions.filter((session) => session.accountId !== req.params.id);
  saveDatabase(database);
  res.json({ ok: true });
});

app.put('/api/profile-picture', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Please log in first.' });
  const picture = typeof req.body.profilePicture === 'string' ? req.body.profilePicture.trim() : '';
  if (picture.length > 4 * 1024 * 1024) {
    return res.status(413).json({ error: 'Profile picture is too large.' });
  }

  const database = readDatabase();
  const account = database.accounts.find((entry) => entry.id === req.user.id);
  account.profilePicture = picture;
  saveDatabase(database);
  res.json({ user: publicAccount(account) });
});

app.use('/.data', (req, res) => res.sendStatus(404));

app.get('/', (req, res) => {
  res.render('index');
});

app.get('/about', (req, res) => {
  res.render('about');
});

app.get('/profile', (req, res) => {
  res.render('profile');
});

app.get('/index.html', (req, res) => {
  res.redirect('/');
});

app.get('/about.html', (req, res) => {
  res.redirect('/about');
});

app.get('/profile.html', (req, res) => {
  res.redirect('/profile');
});

app.use(express.static(path.join(__dirname), { dotfiles: 'deny', index: false }));

module.exports = app;
