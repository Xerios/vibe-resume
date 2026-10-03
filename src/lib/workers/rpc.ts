/**
 * Calling a function in a worker as if it were here, as a promise.
 *
 * Both halves are deliberately small: a worker `serve`s a table of plain
 * functions, and the page `connect`s to it and gets one back whose calls
 * resolve with whatever the worker's function returned, structured-cloned on
 * the way. Nothing is shared; arguments and results are copied, which is what
 * keeps a parse of a long CV from freezing the editor while it runs.
 *
 * Where there is no worker — no `Worker` at all, or one that failed to load —
 * the same functions run inline instead, so a caller never has to care.
 */

/**
 * @typedef {{ id: number, name: string, args: unknown[] }} Request
 * @typedef {{ id: number, value?: unknown, error?: string }} Reply
 */

/**
 * The worker's side of the channel. Typed by hand: the project is checked
 * against the DOM library, which has no worker global scope in it.
 * @typedef {{ postMessage(message: Reply): void, addEventListener(type: 'message', listener: (e: MessageEvent<Request>) => void): void }} WorkerScope
 */

/**
 * Answer calls to `fns` from inside a worker.
 * @param {Record<string, (...args: any[]) => unknown>} fns
 */
export function serve(fns) {
  const scope = /** @type {WorkerScope} */ (/** @type {unknown} */ (self))
  /** @param {Reply} message */
  const reply = (message) =>
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin; that is a window's
    scope.postMessage(message)
  scope.addEventListener('message', (e) => {
    const { id, name, args } = e.data
    try {
      reply({ id, value: fns[name](...args) })
    } catch (err) {
      reply({ id, error: err instanceof Error ? err.message : String(err) })
    }
  })
}

/**
 * A caller for a worker's functions. The worker is started on the first call
 * rather than here, so importing this costs nothing until it is used.
 *
 * `fallback` is the same table the worker serves, for running inline.
 * Importing it here means the page carries the code as well as the worker;
 * it does anyway — the editor's completion and the history's labels parse
 * on the main thread.
 *
 * @template {Record<string, (...args: any[]) => unknown>} T
 * @param {() => Worker} start
 * @param {T} fallback
 * @returns {<K extends keyof T & string>(name: K, ...args: Parameters<T[K]>) => Promise<ReturnType<T[K]>>}
 */
export function connect(start, fallback) {
  /** @type {Worker | null} */
  let worker = null
  let broken = typeof Worker === 'undefined'
  let next = 0
  /** @type {Map<number, { resolve: (v: any) => void, reject: (e: Error) => void, name: string, args: unknown[] }>} */
  const pending = new Map()

  /** Give up on the worker, and finish what it was asked inline. */
  const fail = () => {
    broken = true
    worker?.terminate()
    worker = null
    for (const [id, call] of pending) {
      pending.delete(id)
      inline(call.name, call.args).then(call.resolve, call.reject)
    }
  }

  /** @param {string} name @param {unknown[]} args */
  const inline = async (name, args) => fallback[name](...args)

  return (name, ...args) => {
    if (broken) return /** @type {Promise<any>} */ (inline(name, args))
    if (!worker) {
      try {
        worker = start()
      } catch {
        fail()
        return /** @type {Promise<any>} */ (inline(name, args))
      }
      worker.addEventListener('message', (/** @type {MessageEvent<Reply>} */ e) => {
        const call = pending.get(e.data.id)
        if (!call) return
        pending.delete(e.data.id)
        if (e.data.error === undefined) call.resolve(e.data.value)
        else call.reject(new Error(e.data.error))
      })
      worker.addEventListener('error', fail)
    }
    const id = ++next
    const target = worker
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, name, args })
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a Worker's postMessage has no target origin; that is a window's
      target.postMessage(/** @type {Request} */ ({ id, name, args }))
    })
  }
}
