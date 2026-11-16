import { createApp } from './app.js';
import { createDatabase } from './shared/database.js';

const port = Number(process.env.PORT ?? 3000);
const databasePath = process.env.DATABASE_PATH ?? 'data.db';

const app = createApp(createDatabase(databasePath));

app.listen(port, () => {
  console.log(`Inventory & Order API listening on http://localhost:${port}`);
});
