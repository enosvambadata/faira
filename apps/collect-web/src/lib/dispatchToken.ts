// The dispatch pages authenticate with the shared Faira ADMIN_TOKEN, not
// a user session. sessionStorage (not localStorage) on purpose: the token
// dies with the tab instead of lingering on shared machines.
const KEY = "collect-uk-dispatch-token";

export function getDispatchToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(KEY);
}

export function setDispatchToken(token: string): void {
  window.sessionStorage.setItem(KEY, token);
}

export function clearDispatchToken(): void {
  window.sessionStorage.removeItem(KEY);
}
