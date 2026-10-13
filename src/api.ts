export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof Blob)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init.headers,
    },
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok)
    throw new Error(data.error || "No pudimos conectar. Inténtalo de nuevo.");
  return data as T;
}
export function storeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private browsers may disable storage. */
  }
}
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}
