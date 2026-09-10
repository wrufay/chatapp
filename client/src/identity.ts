// Anonymous, account-free identity: a random id + secret persisted in this
// browser, and a self-chosen nickname. No server-side verification beyond
// "does the secret match what we saw for this id before" — enough to stop
// casual impersonation without any signup step.

const ID_KEY = 'chatapp_user_id';
const SECRET_KEY = 'chatapp_secret';
const NAME_KEY = 'chatapp_username';

function randomId(): string {
  return crypto.randomUUID();
}

export function getUserId(): string {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = randomId();
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function getSecret(): string {
  let secret = localStorage.getItem(SECRET_KEY);
  if (!secret) {
    secret = randomId();
    localStorage.setItem(SECRET_KEY, secret);
  }
  return secret;
}

export function getUsername(): string | null {
  return localStorage.getItem(NAME_KEY);
}

export function setUsername(name: string): void {
  localStorage.setItem(NAME_KEY, name.trim());
}

export function clearUsername(): void {
  localStorage.removeItem(NAME_KEY);
}

// Kept as `() => Promise<string | null>` so it drops straight into the
// existing `getToken` prop used by Sidebar/ChatPanel/ProfileModal.
export async function getToken(): Promise<string> {
  return `${getUserId()}.${getSecret()}`;
}
