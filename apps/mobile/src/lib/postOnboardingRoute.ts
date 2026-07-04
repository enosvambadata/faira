import { getSession } from './session';
import { resolvePostAuthRoute } from './postAuthRoute';

export type PostOnboardingRoute = 'Auth' | 'ProfileSetup' | 'Tabs';

// Decides where to go right after onboarding finishes (whether by
// completing all 3 steps or hitting Skip): straight to auth if there's no
// session yet, otherwise whatever resolvePostAuthRoute decides.
export async function resolvePostOnboardingRoute(): Promise<PostOnboardingRoute> {
  const session = await getSession();
  if (!session) {
    return 'Auth';
  }
  return resolvePostAuthRoute();
}
