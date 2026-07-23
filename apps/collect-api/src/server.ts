import './instrument';
import { createApp } from './app';
import { assertRequiredEnv, warnOptionalConfig } from './requiredEnv';
import { logger } from './logger';

// Fail fast on a misconfigured deploy (e.g. a missing tracking-token secret)
// rather than 500ing individual requests once traffic arrives.
assertRequiredEnv();
// Warn (don't crash) when a notification channel is unconfigured — a live
// deploy that silently can't reach customers should be obvious in the logs.
warnOptionalConfig(logger);

const PORT = process.env.PORT ?? 3000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`collect-api listening on port ${PORT}`);
});
