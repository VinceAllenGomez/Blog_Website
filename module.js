const app = require('./express');
const { initializeDatabase } = require('./database');

const port = process.env.PORT || 3000;

initializeDatabase()
  .then(() => app.listen(port, () => console.log(`LiM-iMa is running at http://localhost:${port}`)))
  .catch((error) => {
    console.error('Unable to initialize the journal database:', error);
    process.exitCode = 1;
  });
