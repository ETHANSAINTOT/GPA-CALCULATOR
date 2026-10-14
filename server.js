import { createApp } from './src/app.js';
import { closeDb, initDb } from './src/db.js';

const PORT = Number(process.env.PORT ?? 5984);
const HOST = process.env.HOST ?? 'localhost';

// Fail fast on a missing database or a wrong ENCRYPTION_KEY instead of on the first request.
await initDb();

const server = createApp().listen(PORT, HOST, (error) => {
  if (error) throw error;
  console.log(`GPA Calculator disponible sur http://localhost:${PORT}`);
});

// `docker stop` sends SIGTERM: finish in-flight requests and close the database cleanly.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
    server.closeIdleConnections();
  });
}
