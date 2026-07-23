import './instrument';
import { createApp } from './app';
import { assertRequiredEnv } from './requiredEnv';

// Fail fast on a misconfigured deploy rather than 500ing individual requests.
assertRequiredEnv();

const PORT = process.env.PORT ?? 3000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`fulfilment-api listening on port ${PORT}`);
});
