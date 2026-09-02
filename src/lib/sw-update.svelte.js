/**
 * Whether a newer build is waiting in the wings, and the one way to let it in.
 *
 * The worker in `src/service-worker.js` installs without calling `skipWaiting()`,
 * so a fresh deploy parks itself in `waiting` and takes over only once every tab
 * on the old version has closed. That is the right default for an editor — nobody
 * wants their session swapped out mid-keystroke — but left unannounced it means an
 * installed copy can sit on a stale build indefinitely. So the arrival is watched
 * for, reported in the status bar, and applied when the user says so.
 */

/** How rarely the browser is asked to look for a new worker. Deploys aren't frequent. */
const RECHECK_MS = 15 * 60 * 1000

/** How long the swap gets before the reload happens anyway, worker or no worker. */
const TAKEOVER_TIMEOUT_MS = 3000

class SwUpdate {
  /** A newer worker has finished installing and is ready to take over. */
  available = $state(false)

  /** @type {ServiceWorkerRegistration | null} */
  #registration = null

  #started = false

  /** Set once this tab has asked for the swap, so the reload only happens once. */
  #reloading = false

  #checkedAt = 0

  /** Idempotent, and a no-op wherever no worker is registered — `vite dev`, mostly. */
  async start() {
    if (this.#started) return
    this.#started = true
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    // Not `getRegistration()`: SvelteKit registers the worker on the window's `load`
    // event, which can land after this runs. `ready` waits for it instead, and simply
    // never settles where there is nothing to register.
    const registration = await navigator.serviceWorker.ready
    this.#registration = registration

    // A worker that finished installing while this tab was elsewhere, or before the
    // page was even opened.
    if (registration.waiting) this.available = true

    registration.addEventListener('updatefound', () => {
      const installing = registration.installing
      if (!installing) return
      installing.addEventListener('statechange', () => {
        // No controller means this is the first-ever install, which is not an update.
        if (installing.state === 'installed' && navigator.serviceWorker.controller) this.available = true
      })
    })

    // A second tab clicked the button. This one's bytes are now the old version's,
    // and the cache they came from has been purged, so it needs the same reload.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!this.#reloading) this.available = true
    })

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.#check()
    })

    void this.#check()
  }

  /** Ask the browser to go and look, at most so often. */
  async #check() {
    const registration = this.#registration
    if (!registration) return

    const now = Date.now()
    if (now - this.#checkedAt < RECHECK_MS) return
    this.#checkedAt = now

    try {
      await registration.update()
    } catch {
      // Offline, which for this app is an ordinary state rather than a fault.
    }
  }

  /** Hand the page over to the waiting worker and come back on the new version. */
  applyUpdate() {
    if (this.#reloading) return
    this.#reloading = true

    const waiting = this.#registration?.waiting
    if (!waiting) {
      location.reload()
      return
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true })
    // A worker that never activates shouldn't leave the button pressed forever.
    setTimeout(() => location.reload(), TAKEOVER_TIMEOUT_MS)
    // The rule below means `window.postMessage`; a ServiceWorker's takes a transfer
    // list as its second argument, not an origin, so there is nothing to pass.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    waiting.postMessage({ type: 'SKIP_WAITING' })
  }
}

/** One per document, like the state objects in `cv/state.svelte.js`. */
export const swUpdate = new SwUpdate()
