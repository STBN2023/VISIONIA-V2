/**
 * Exécute `fn` sur chaque élément avec au plus `concurrency` appels simultanés.
 *
 * Les résultats conservent l'ordre des éléments, quel que soit l'ordre de fin.
 * Une exception interrompt le lot : pour un traitement tolérant aux échecs,
 * faire en sorte que `fn` retourne l'erreur au lieu de la lever.
 */
export async function parallelBatch<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
