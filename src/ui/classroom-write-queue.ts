/** Serializes classroom writes across navigation/remounts. Never replays an
 * unsuccessful operation and never stores classroom text on disk. */
const queues = new WeakMap<object, Map<string, Promise<unknown>>>();
export function classroomWritePending(owner: object, key: string) {
  return queues.get(owner)?.has(key) ?? false;
}
export function enqueueClassroomWrite<T>(owner: object, key: string, write: () => Promise<T>) {
  let pending = queues.get(owner);
  if (!pending) {
    pending = new Map();
    queues.set(owner, pending);
  }
  const previous = pending.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(write);
  pending.set(key, next);
  void next
    .finally(() => {
      if (pending.get(key) === next) pending.delete(key);
    })
    .catch(() => undefined);
  return next;
}
