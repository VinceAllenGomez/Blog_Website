const themeToggle = document.getElementById('themeToggle');
const postsList = document.getElementById('postsList');
const dictionaryForm = document.getElementById('dictionaryForm');
const dictionaryResults = document.getElementById('dictionaryResults');
const dictionaryStatus = document.getElementById('dictionaryStatus');
const apiBaseUrl = window.LIMIMA_CONFIG?.apiBaseUrl?.replace(/\/+$/, '') || '';
const apiRequestTimeoutMs = 120000;
const deleteTokenStorageKey = 'limimaPostDeleteToken:';
const commentDeleteTokenStorageKey = 'limimaCommentDeleteToken:';
const localPostsStorageKey = 'limimaJournalPosts';

function apiUrl(path) {
  return `${apiBaseUrl}${path}`;
}

async function fetchApi(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), apiRequestTimeoutMs);

  try {
    return await fetch(apiUrl(path), { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('The journal server did not respond within 120 seconds. It may be waking up; please try again.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function readApiResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('The journal API returned an invalid response. Check its deployment URL.');
  }
  return response.json();
}

function getDeleteToken(postId) {
  return localStorage.getItem(`${deleteTokenStorageKey}${postId}`);
}

function getCommentDeleteToken(commentId) {
  return localStorage.getItem(`${commentDeleteTokenStorageKey}${commentId}`);
}

function readLocalPosts() {
  const savedPosts = localStorage.getItem(localPostsStorageKey);
  if (!savedPosts) return [];

  let posts;
  try {
    posts = JSON.parse(savedPosts);
  } catch {
    throw new Error('Saved journal entries could not be read. Clear this site’s saved data and try again.');
  }
  if (!Array.isArray(posts)) {
    throw new Error('Saved journal entries have an invalid format.');
  }
  return posts;
}

function writeLocalPosts(posts) {
  try {
    localStorage.setItem(localPostsStorageKey, JSON.stringify(posts));
  } catch (error) {
    console.error('Unable to save journal entries in this browser:', error);
    throw new Error('Your journal could not be saved in this browser. Check available storage and try again.');
  }
}

function createLocalId() {
  return window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function submitLocalForm(form, body) {
  const posts = readLocalPosts();
  const createdAt = new Date().toISOString();
  const authorName = String(body.authorName || '').trim().slice(0, 40) || 'Guest';
  const content = String(body.content || '').trim();
  if (!content) throw new Error('Enter something to share.');

  if (form === postForm) {
    const post = {
      id: createLocalId(),
      authorName,
      content,
      createdAt,
      localCanDelete: true,
      comments: []
    };
    posts.unshift(post);
    writeLocalPosts(posts);
    return { post };
  }

  const postId = form.dataset.postId;
  const post = posts.find((entry) => entry.id === postId);
  if (!post) throw new Error('This post is no longer available.');
  const comment = {
    id: createLocalId(),
    authorName,
    content,
    createdAt,
    localCanDelete: true
  };
  post.comments ||= [];
  post.comments.push(comment);
  writeLocalPosts(posts);
  return { comment };
}

function setTheme(isDark) {
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  localStorage.setItem('mindfulJournalTheme', isDark ? 'dark' : 'light');

  if (themeToggle) {
    themeToggle.setAttribute('aria-pressed', String(isDark));
    themeToggle.textContent = isDark ? 'Light mode' : 'Dark mode';
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function renderPosts(posts) {
  if (!postsList) return;

  if (!posts.length) {
    postsList.innerHTML = `
      <div class="feed-message empty-state">
        <span class="empty-spark" aria-hidden="true">✳</span>
        <p>No journal entries just yet.</p>
        <span>Check back soon for something new to read.</span>
      </div>
    `;
    return;
  }

  postsList.innerHTML = posts.map((post) => {
    const authorName = post.authorName || post.username || 'Guest';
    const initials = authorName.trim().charAt(0).toUpperCase() || 'L';
    const avatar = post.profilePicture
      ? `<img class="post-avatar" src="${escapeHtml(post.profilePicture)}" alt="" referrerpolicy="no-referrer" />`
      : `<span class="post-avatar post-avatar-fallback" aria-hidden="true">${escapeHtml(initials)}</span>`;
    const comments = Array.isArray(post.comments) ? post.comments : [];
    const canDelete = post.canDelete || post.localCanDelete || !!getDeleteToken(post.id);
    const commentMarkup = comments.length
      ? comments.map((comment) => {
        const canDeleteComment = post.canDelete || comment.localCanDelete || !!getCommentDeleteToken(comment.id);
        return `
          <article class="comment">
            <div class="comment-meta">
              <span class="comment-author">${escapeHtml(comment.authorName || 'Guest')}</span>
              <time datetime="${escapeHtml(comment.createdAt || '')}">${escapeHtml(formatDate(comment.createdAt))}</time>
            </div>
            <p>${escapeHtml(comment.content || '')}</p>
            ${canDeleteComment ? `
              <div class="comment-actions">
                <p class="delete-status" aria-live="polite"></p>
                <button class="delete-comment-button" type="button" data-post-id="${escapeHtml(post.id)}" data-comment-id="${escapeHtml(comment.id)}">Delete comment</button>
              </div>
            ` : ''}
          </article>
        `;
      }).join('')
      : '<p class="no-comments">No comments yet. Start the conversation.</p>';

    return `
      <article class="post-card">
        <div class="post-meta">
          ${avatar}
          <div class="post-byline">
            <span class="post-author">${escapeHtml(authorName)}</span>
            <time datetime="${escapeHtml(post.createdAt || '')}">${escapeHtml(formatDate(post.createdAt))}</time>
          </div>
          <span class="post-dot" aria-hidden="true">✳</span>
        </div>
        <p class="post-content">${escapeHtml(post.content || '')}</p>
        ${canDelete ? `
          <div class="post-card-actions">
            <p class="delete-status" aria-live="polite"></p>
            <button class="delete-post-button" type="button" data-post-id="${escapeHtml(post.id)}">Delete post</button>
          </div>
        ` : ''}
        <section class="comments-section" aria-label="Comments">
          <h3>Comments <span>${comments.length}</span></h3>
          <div class="comments-list">${commentMarkup}</div>
          <form class="comment-form" data-post-id="${escapeHtml(post.id)}">
            <label>
              <span>Your name <span class="optional-label">(optional)</span></span>
              <input name="authorName" maxlength="40" autocomplete="name" placeholder="Guest" />
            </label>
            <label>
              <span>Your comment</span>
              <textarea name="content" rows="2" required placeholder="Add to the conversation…"></textarea>
            </label>
            <div class="form-actions">
              <p class="form-status" aria-live="polite"></p>
              <button class="submit-button" type="submit">Comment</button>
            </div>
          </form>
        </section>
      </article>
    `;
  }).join('');
}

async function loadPosts() {
  if (!postsList) return;

  try {
    if (!apiBaseUrl) {
      const posts = readLocalPosts()
        .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))
        .map((post) => ({ ...post, canDelete: post.localCanDelete || !!getDeleteToken(post.id) }));
      renderPosts(posts);
      return;
    }

    const response = await fetchApi('/api/posts', { credentials: 'include' });
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.error || 'Could not load journal entries.');
    if (!Array.isArray(result.posts)) throw new Error('The journal returned an invalid response.');
    renderPosts(result.posts);
  } catch (error) {
    console.error('Unable to load public journal entries:', error);
    postsList.innerHTML = '<p class="feed-message feed-error">Journal entries could not be loaded. Please try again later.</p>';
  }
}

function addDictionaryText(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function renderDictionaryEntries(entries) {
  dictionaryResults.replaceChildren();

  entries.forEach((entry) => {
    const card = document.createElement('article');
    card.className = 'dictionary-card';
    const heading = addDictionaryText(card, 'h3', 'dictionary-word', entry.word || 'Word');

    const phonetic = entry.phonetics.find((item) => item.text || item.audio);
    if (phonetic) {
      const pronunciation = document.createElement('div');
      pronunciation.className = 'dictionary-pronunciation';
      if (phonetic.text) addDictionaryText(pronunciation, 'span', '', phonetic.text);
      if (phonetic.audio) {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.preload = 'none';
        audio.src = phonetic.audio;
        audio.setAttribute('aria-label', `Pronunciation of ${entry.word}`);
        pronunciation.append(audio);
      }
      heading.after(pronunciation);
    }

    entry.meanings.forEach((meaning) => {
      const meaningSection = document.createElement('section');
      meaningSection.className = 'dictionary-meaning';
      addDictionaryText(meaningSection, 'h4', '', meaning.partOfSpeech || 'Meaning');
      const definitions = document.createElement('ol');
      meaning.definitions.forEach((definition) => {
        const item = document.createElement('li');
        addDictionaryText(item, 'p', '', definition.definition);
        if (definition.example) addDictionaryText(item, 'p', 'dictionary-example', `“${definition.example}”`);
        definitions.append(item);
      });
      meaningSection.append(definitions);
      card.append(meaningSection);
    });

    dictionaryResults.append(card);
  });
}

if (dictionaryForm) {
  dictionaryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = dictionaryForm.elements.namedItem('word');
    const word = input.value.trim();
    const submitButton = dictionaryForm.querySelector('button[type="submit"]');
    if (!word) return;

    submitButton.disabled = true;
    dictionaryStatus.classList.remove('dictionary-error');
    dictionaryStatus.textContent = 'Looking up the word…';
    dictionaryResults.replaceChildren();

    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      const result = await response.json();
      if (!response.ok) {
        const message = result && typeof result.message === 'string'
          ? result.message
          : 'No definition was found. Check the spelling and try again.';
        throw new Error(message);
      }
      if (!Array.isArray(result) || !result.length) {
        throw new Error('The dictionary returned no definitions for that word.');
      }

      const entries = result.filter((entry) => entry && Array.isArray(entry.meanings))
        .map((entry) => ({
          ...entry,
          phonetics: Array.isArray(entry.phonetics) ? entry.phonetics : [],
          meanings: entry.meanings.filter((meaning) => meaning && Array.isArray(meaning.definitions))
        }));
      if (!entries.length) throw new Error('The dictionary returned an unexpected response.');

      renderDictionaryEntries(entries);
      dictionaryStatus.textContent = '';
    } catch (error) {
      console.error('Unable to look up dictionary word:', error);
      dictionaryStatus.textContent = error.message || 'The word could not be looked up. Please try again.';
      dictionaryStatus.classList.add('dictionary-error');
    } finally {
      submitButton.disabled = false;
    }
  });
}

const postForm = document.getElementById('postForm');

async function submitForm(form, url, successMessage) {
  const status = form.querySelector('.form-status');
  const submitButton = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  const body = Object.fromEntries(formData.entries());
  submitButton.disabled = true;
  status.textContent = apiBaseUrl
    ? 'Connecting to the journal server. It may take a little while to wake after inactivity.'
    : 'Saving in this browser…';

  try {
    let result;
    if (apiBaseUrl) {
      const response = await fetchApi(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.error || 'Your message could not be shared.');
    } else {
      result = submitLocalForm(form, body);
    }
    if (form === postForm && result.deletionToken && result.post) {
      localStorage.setItem(`${deleteTokenStorageKey}${result.post.id}`, result.deletionToken);
    }
    if (form.classList.contains('comment-form') && result.deletionToken && result.comment) {
      localStorage.setItem(`${commentDeleteTokenStorageKey}${result.comment.id}`, result.deletionToken);
    }
    if (form === postForm) form.reset();
    const successStatus = apiBaseUrl
      ? successMessage
      : (form === postForm ? 'Your post is saved in this browser.' : 'Comment saved in this browser.');
    status.textContent = successStatus;
    await loadPosts();
    if (form.classList.contains('comment-form')) {
      const refreshedForm = Array.from(postsList.querySelectorAll('.comment-form'))
        .find((entry) => entry.dataset.postId === form.dataset.postId);
      const refreshedStatus = refreshedForm?.querySelector('.form-status');
      if (refreshedStatus) refreshedStatus.textContent = successStatus;
    }
  } catch (error) {
    console.error('Unable to submit journal content:', error);
    status.textContent = error.message || 'Your message could not be shared. Please try again.';
  } finally {
    submitButton.disabled = false;
  }
}

if (postForm) {
  postForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitForm(postForm, '/api/posts', 'Your post is live.');
  });
}

if (postsList) {
  postsList.addEventListener('click', async (event) => {
    const commentButton = event.target.closest('.delete-comment-button');
    if (commentButton) {
      if (!window.confirm('Delete this comment? This cannot be undone.')) return;

      const { postId, commentId } = commentButton.dataset;
      const status = commentButton.parentElement.querySelector('.delete-status');
      commentButton.disabled = true;
      status.textContent = '';

      try {
        if (apiBaseUrl) {
          const response = await fetchApi(`/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ deleteToken: getCommentDeleteToken(commentId) })
          });
          const result = await readApiResponse(response);
          if (!response.ok) throw new Error(result.error || 'The comment could not be deleted.');
        } else {
          const posts = readLocalPosts();
          const post = posts.find((entry) => entry.id === postId);
          const comment = post?.comments?.find((entry) => entry.id === commentId);
          if (!post || (!comment?.localCanDelete && !getCommentDeleteToken(commentId))) {
            throw new Error('You can only delete comments created in this browser.');
          }
          const comments = Array.isArray(post.comments) ? post.comments : [];
          if (!comments.some((comment) => comment.id === commentId)) {
            throw new Error('This comment is no longer available.');
          }
          post.comments = comments.filter((comment) => comment.id !== commentId);
          writeLocalPosts(posts);
        }
        localStorage.removeItem(`${commentDeleteTokenStorageKey}${commentId}`);
        await loadPosts();
      } catch (error) {
        console.error('Unable to delete journal comment:', error);
        status.textContent = error.message || 'The comment could not be deleted. Please try again.';
        commentButton.disabled = false;
      }
      return;
    }

    const button = event.target.closest('.delete-post-button');
    if (!button || !window.confirm('Delete this post? This cannot be undone.')) return;

    const postId = button.dataset.postId;
    const status = button.parentElement.querySelector('.delete-status');
    button.disabled = true;
    status.textContent = '';

    try {
      if (apiBaseUrl) {
        const response = await fetchApi(`/api/posts/${encodeURIComponent(postId)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ deleteToken: getDeleteToken(postId) })
        });
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.error || 'The post could not be deleted.');
      } else {
        const posts = readLocalPosts();
        const post = posts.find((entry) => entry.id === postId);
        if (!post || (!post.localCanDelete && !getDeleteToken(postId))) {
          throw new Error('You can only delete posts created in this browser.');
        }
        writeLocalPosts(posts.filter((entry) => entry.id !== postId));
        post.comments?.forEach((comment) => {
          localStorage.removeItem(`${commentDeleteTokenStorageKey}${comment.id}`);
        });
      }
      localStorage.removeItem(`${deleteTokenStorageKey}${postId}`);
      await loadPosts();
    } catch (error) {
      console.error('Unable to delete journal post:', error);
      status.textContent = error.message || 'The post could not be deleted. Please try again.';
      button.disabled = false;
    }
  });

  postsList.addEventListener('submit', (event) => {
    const form = event.target.closest('.comment-form');
    if (!form) return;
    event.preventDefault();
    submitForm(form, `/api/posts/${encodeURIComponent(form.dataset.postId)}/comments`, 'Comment added.');
  });
}

setTheme(localStorage.getItem('mindfulJournalTheme') === 'dark');

if (!apiBaseUrl) {
  window.addEventListener('storage', (event) => {
    if (event.key === localPostsStorageKey) loadPosts();
  });
}

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme !== 'dark');
  });
}

loadPosts();
