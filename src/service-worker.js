/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

/**
 * Asset delivery for an app that is otherwise already offline: no server routes,
 * no network calls, every byte of state in localStorage. All that was missing was
 * the ability to *load* without a server.
 *
 * SvelteKit registers this automatically in a production build and leaves it out
 * of `vite dev`, so development never serves stale bytes.
 */

import { base, build, files, prerendered, version } from '$service-worker'

const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self))

const CACHE = `cv-editor-${version}`

/** The Vite bundle (hashed, immutable), everything in static/, and the prerendered shell. */
const PRECACHE = [...build, ...files, ...prerendered]
const PRECACHED = new Set(PRECACHE)

sw.addEventListener('install', (event) => {
  // No `skipWaiting()`, deliberately. A new worker then activates only once every
  // tab running the old one has closed, which buys two things: an open editing
  // session is never swapped out mid-edit, and the cache purge below cannot delete
  // a lazily-loaded chunk that a live page still wants.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)))
})

// The one way past that: the status bar's "Update ready" button, which is the user
// saying the swap is welcome and which reloads the moment it lands. Activating early
// takes over *every* client, so a second tab left on the old version can find a
// lazily-loaded chunk purged above — it watches `controllerchange` and offers the
// same reload rather than breaking silently. See `src/lib/sw-update.svelte.js`.
sw.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void sw.skipWaiting()
})

sw.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))))
})

sw.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== sw.location.origin) return

  event.respondWith(respond(request, url))
})

/**
 * @param {Request} request
 * @param {URL} url
 */
async function respond(request, url) {
  const cache = await caches.open(CACHE)

  // Precached URLs are either content-hashed or shipped with the version, so a hit
  // is always the right answer and never needs revalidating.
  if (PRECACHED.has(url.pathname)) {
    const hit = await cache.match(url.pathname)
    if (hit) return hit
  }

  // One route exists; adapter-static's `fallback: 'index.html'` covers anything else.
  // Serving the cached shell rather than the network keeps the HTML and the hashed
  // assets it points at on the same version.
  if (request.mode === 'navigate') {
    const shell = (await cache.match(request)) ?? (await cache.match(`${base}/`))
    if (shell) return shell
  }

  try {
    const response = await fetch(request)
    // Belt and braces for the Loro `.wasm`, which is fetched lazily on first
    // document load: even if it somehow missed the precache list, the first online
    // visit puts it here. `basic` excludes opaque cross-origin and error responses.
    if (response.ok && response.type === 'basic') cache.put(request, response.clone())
    return response
  } catch (err) {
    const hit = await cache.match(request)
    if (hit) return hit
    throw err
  }
}
