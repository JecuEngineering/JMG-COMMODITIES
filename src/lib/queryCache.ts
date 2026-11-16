interface Entry {
  at: number
  value: unknown
}

const entries = new Map<string, Entry>()
const inFlight = new Map<string, Promise<unknown>>()

/**
 * Reuses recently fetched data across page mounts (branch/sku lookups) and
 * de-duplicates concurrent requests from several components on one screen.
 * Mutations that change reference data should call `invalidateQuery`.
 */
export function cachedQuery<T>(key: string, fetcher: () => Promise<T>, ttlMs = 60_000): Promise<T> {
  const hit = entries.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value as T)

  const pending = inFlight.get(key)
  if (pending) return pending as Promise<T>

  const promise = fetcher()
    .then((value) => {
      entries.set(key, { at: Date.now(), value })
      return value
    })
    .finally(() => inFlight.delete(key))

  inFlight.set(key, promise)
  return promise
}

export function invalidateQuery(prefix: string) {
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key)
  }
}
