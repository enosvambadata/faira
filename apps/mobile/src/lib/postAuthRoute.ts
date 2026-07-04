import { profile } from './api';

export type PostAuthRoute = 'ProfileSetup' | 'Tabs';

// Decides where a user lands after establishing a session: straight to the
// tabs if they already have a display name, or profile setup if this is
// their first time completing login. Fails open to Tabs on error (e.g. a
// flaky network) rather than trapping the user on an error screen — later
// screens are responsible for handling their own auth failures.
export async function resolvePostAuthRoute(): Promise<PostAuthRoute> {
  try {
    const data = await profile.get();
    return data.displayName ? 'Tabs' : 'ProfileSetup';
  } catch {
    return 'Tabs';
  }
}
