const fs = require('fs');
const path = require('path');

const apiBaseUrl = process.env.API_BASE_URL;
if (!apiBaseUrl) {
  throw new Error('Set API_BASE_URL to the deployed HTTPS API origin before building GitHub Pages.');
}

let parsedApiUrl;
try {
  parsedApiUrl = new URL(apiBaseUrl);
} catch {
  throw new Error('API_BASE_URL must be a valid HTTPS URL.');
}
if (parsedApiUrl.protocol !== 'https:' || parsedApiUrl.search || parsedApiUrl.hash) {
  throw new Error('API_BASE_URL must use HTTPS and must not include a query string or fragment.');
}

const root = __dirname;
const outputDirectory = path.join(root, '_site');
fs.mkdirSync(outputDirectory, { recursive: true });

for (const page of ['index', 'about', 'profile']) {
  const template = fs.readFileSync(path.join(root, `${page}.ejs`), 'utf8');
  if (/<%/.test(template)) {
    throw new Error(`The ${page}.ejs page contains server-side EJS code and cannot be published as a static page.`);
  }
  const appScript = '<script src="./app.js" defer></script>';
  if (!template.includes(appScript)) {
    throw new Error(`Could not find the app.js script tag in ${page}.ejs.`);
  }
  const configScript = '<script src="./pages-config.js" defer></script>\n    ';
  const html = template.replace(appScript, `${configScript}${appScript}`);
  const outputName = page === 'index' ? 'index.html' : `${page}.html`;
  fs.writeFileSync(path.join(outputDirectory, outputName), html);
}

for (const asset of ['app.js', 'styles.css']) {
  fs.copyFileSync(path.join(root, asset), path.join(outputDirectory, asset));
}

const config = `window.LIMIMA_CONFIG = ${JSON.stringify({ apiBaseUrl: parsedApiUrl.origin + parsedApiUrl.pathname.replace(/\/+$/, '') })};\n`;
fs.writeFileSync(path.join(outputDirectory, 'pages-config.js'), config);
console.log(`Built GitHub Pages site in ${outputDirectory}`);
