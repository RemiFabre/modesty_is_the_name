const NAME_KEY = "modesty:name";

export function tokenKey(roomCode: string): string {
  return `modesty:session:${roomCode.toUpperCase()}`;
}

export function loadSessionToken(roomCode: string): string | null {
  return localStorage.getItem(tokenKey(roomCode));
}

export function saveSessionToken(roomCode: string, token: string): void {
  localStorage.setItem(tokenKey(roomCode), token);
}

export function clearSessionToken(roomCode: string): void {
  localStorage.removeItem(tokenKey(roomCode));
}

export function loadName(): string {
  return localStorage.getItem(NAME_KEY) ?? "";
}

export function saveName(name: string): void {
  localStorage.setItem(NAME_KEY, name);
}
