/**
 * Small in-process locking utilities.
 *
 * These provide same-process concurrency safety only — they do not protect
 * against races between separate OS processes sharing the same on-disk
 * repository. Cross-process locking is a separate concern (e.g. a lockfile
 * with retry/backoff) and is intentionally out of scope here.
 */

/**
 * A simple FIFO async mutex: `run(fn)` queues `fn` to execute only once all
 * previously-queued work on this mutex has settled, serializing access to
 * whatever critical section `fn` represents.
 */
export class Mutex {
  constructor() {
    /** @type {Promise<any>} */
    this._queue = Promise.resolve();
  }

  /**
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  run(fn) {
    const result = this._queue.then(() => fn());
    // Keep the queue moving even if `fn` rejects — a failed critical section
    // must not permanently wedge the lock for subsequent callers.
    this._queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

/**
 * A registry of mutexes keyed by an arbitrary string (typically a file path),
 * so unrelated paths don't contend with each other while operations on the
 * *same* path are fully serialized.
 */
export class KeyedMutex {
  constructor() {
    /** @type {Map<string, Mutex>} */
    this._mutexes = new Map();
  }

  /**
   * @template T
   * @param {string} key
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  run(key, fn) {
    let mutex = this._mutexes.get(key);
    if (!mutex) {
      mutex = new Mutex();
      this._mutexes.set(key, mutex);
    }
    return mutex.run(fn);
  }
}
