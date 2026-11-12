const fs = require('fs');
const path = require('path');

const apiBaseUrl = process.env.API_BASE_URL?.trim() || '';
let normalizedApiBaseUrl = '';
if (apiBaseUrl) {
  let parsedApiUrl;
  try {
    parsedApiUrl = new URL(apiBaseUrl);
  } catch {
    throw new Error('API_BASE_URL must be a valid HTTPS URL.');
  }
  if (parsedApiUrl.protocol !== 'https:' || parsedApiUrl.search || parsedApiUrl.hash) {
    throw new Error('API_BASE_URL must use HTTPS and must not include a query string or fragment.');
  }
  normalizedApiBaseUrl = parsedApiUrl.origin + parsedApiUrl.pathname.replace(/\/+$/, '');
} else {
  console.info("API_BASE_URL is not set; journal entries will be saved in each visitor's browser.");
}

const root = __dirname;
const outputDirectories = [root, path.join(root, '_site')];
outputDirectories.forEach((outputDirectory) => fs.mkdirSync(outputDirectory, { recursive: true }));

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
  outputDirectories.forEach((outputDirectory) => {
    fs.writeFileSync(path.join(outputDirectory, outputName), html);
  });
}

for (const asset of ['app.js', 'styles.css']) {
  const sourcePath = path.join(root, asset);
  outputDirectories.forEach((outputDirectory) => {
    const destinationPath = path.join(outputDirectory, asset);
    if (sourcePath !== destinationPath) fs.copyFileSync(sourcePath, destinationPath);
  });
}

const config = `window.LIMIMA_CONFIG = ${JSON.stringify({ apiBaseUrl: normalizedApiBaseUrl })};\n`;
outputDirectories.forEach((outputDirectory) => {
  fs.writeFileSync(path.join(outputDirectory, 'pages-config.js'), config);
});
console.log(`Built static site in ${outputDirectories.join(' and ')}`);
