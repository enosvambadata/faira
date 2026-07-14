import './instrument';
import { createApp } from './app';
import { assertRequiredEnv } from './requiredEnv';

// Fail fast on a misconfigured deploy rather than 500ing individual requests
// (e.g. a missing tracking-token secret) once traffic arrives.
assertRequiredEnv();

const PORT = process.env.PORT ?? 3000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`faira-api listening on port ${PORT}`);
});
