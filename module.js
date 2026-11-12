const app = require('./express');
const { initializeDatabase } = require('./database');

const port = process.env.PORT || 3000;

initializeDatabase();
app.listen(port, () => console.log(`LiM-iMa is running at http://localhost:${port}`));
