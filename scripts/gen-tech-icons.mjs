/**
 * Regenerate packages/render/src/theme/tech-icons.js — the logos the chip variants draw
 * beside a tool's name, in the preview and in the PDF.
 *
 *   node scripts/gen-tech-icons.mjs
 *
 * The whole Simple Icons set is some 3,000 logos and several megabytes; a CV
 * spends a hundred of them at most. So the curated list below is fetched from
 * the Iconify API once, here, and written out as an ordinary module that ships
 * with the bundle. Nothing at runtime touches the network — the same rule as
 * everything else in this app — and adding a logo means adding a line here and
 * running this again.
 *
 * Simple Icons is CC0-1.0, so the path data can be vendored without a notice.
 * The brands themselves are their owners' and this is nominative use: a CV
 * saying which tools it was written with.
 *
 * Each entry is `slug: [aliases]`. The slug is Simple Icons' own name and is
 * always matched; the aliases are what a CV actually says — `Node.js`, `k8s`,
 * `Postgres` — normalised the same way `iconPaths` normalises a lookup, so
 * punctuation and case are irrelevant here.
 */

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const API = 'https://api.iconify.design/simple-icons.json'
const OUT = fileURLToPath(new URL('../packages/render/src/theme/tech-icons.js', import.meta.url))

/** @type {Record<string, string[]>} */
const ICONS = {
  // ── Languages ────────────────────────────────────────────────────────────
  javascript: ['js', 'es6', 'ecmascript'],
  typescript: ['ts'],
  python: [],
  openjdk: ['java', 'jvm'],
  go: ['golang'],
  rust: [],
  ruby: [],
  php: [],
  cplusplus: ['c++', 'cpp'],
  c: [],
  csharp: ['c#'],
  kotlin: [],
  swift: [],
  scala: [],
  elixir: [],
  erlang: [],
  lua: [],
  perl: [],
  haskell: [],
  clojure: [],
  dart: [],
  r: [],
  julia: [],
  zig: [],
  gnubash: ['bash', 'shell', 'sh', 'zsh', 'shellscripting'],
  powershell: [],
  markdown: [],

  // ── Frontend ─────────────────────────────────────────────────────────────
  react: ['reactjs', 'reactnative'],
  svelte: ['sveltekit'],
  vuedotjs: ['vue', 'vuejs', 'vue3'],
  angular: ['angularjs'],
  nextdotjs: ['next', 'nextjs'],
  nuxt: ['nuxtjs'],
  astro: [],
  solid: ['solidjs'],
  remix: [],
  jquery: [],
  html5: ['html'],
  css: ['css3'],
  sass: ['scss'],
  tailwindcss: ['tailwind'],
  bootstrap: [],
  mui: ['materialui'],
  storybook: [],
  redux: [],
  threedotjs: ['three', 'threejs'],
  d3dotjs: ['d3', 'd3js'],
  electron: [],
  webassembly: ['wasm'],

  // ── Build & tooling ──────────────────────────────────────────────────────
  vite: [],
  webpack: [],
  rollupdotjs: ['rollup'],
  esbuild: [],
  babel: [],
  eslint: [],
  prettier: [],
  npm: [],
  pnpm: [],
  yarn: [],
  git: [],
  github: [],
  gitlab: [],
  bitbucket: [],
  githubactions: ['ghactions'],
  jenkins: [],
  circleci: [],
  gradle: [],
  apachemaven: ['maven'],
  cmake: [],
  opentelemetry: ['otel'],
  visualstudiocode: ['vscode'],
  intellijidea: ['intellij'],
  neovim: ['vim'],
  figma: [],
  jira: [],
  confluence: [],
  notion: [],
  slack: [],
  linear: [],

  // ── Backend & APIs ───────────────────────────────────────────────────────
  nodedotjs: ['node', 'nodejs'],
  deno: [],
  bun: [],
  express: ['expressjs'],
  fastify: [],
  nestjs: ['nest'],
  django: [],
  flask: [],
  fastapi: [],
  spring: ['springboot'],
  laravel: [],
  rubyonrails: ['rails'],
  dotnet: ['net', 'netcore', 'aspnet'],
  graphql: [],
  socketdotio: ['socketio', 'websockets'],
  swagger: ['openapi'],
  nginx: [],
  apache: [],
  apachekafka: ['kafka'],
  rabbitmq: [],
  celery: [],
  stripe: [],
  twilio: [],
  auth0: [],
  wordpress: [],
  shopify: [],

  // ── Data ─────────────────────────────────────────────────────────────────
  postgresql: ['postgres', 'psql'],
  mysql: [],
  mariadb: [],
  mongodb: ['mongo'],
  redis: [],
  sqlite: [],
  elasticsearch: ['elastic', 'elk'],
  clickhouse: [],
  supabase: [],
  firebase: [],
  prisma: [],
  apachespark: ['spark'],
  apacheairflow: ['airflow'],
  pandas: [],
  numpy: [],
  jupyter: [],
  pytorch: ['torch'],
  tensorflow: [],
  scikitlearn: ['sklearn'],
  huggingface: ['hf'],
  keras: [],
  opencv: [],
  langchain: [],
  ollama: [],
  openai: ['gpt', 'chatgpt'],
  anthropic: ['claude'],
  snowflake: [],
  databricks: [],
  dbt: [],
  tableau: [],
  kibana: [],
  googleanalytics: [],
  mixpanel: [],

  // ── Cloud & operations ───────────────────────────────────────────────────
  amazonwebservices: ['aws', 'amazonaws'],
  googlecloud: ['gcp', 'googlecloudplatform'],
  docker: [],
  kubernetes: ['k8s', 'kube'],
  terraform: [],
  ansible: [],
  helm: [],
  linux: [],
  ubuntu: [],
  debian: [],
  redhat: [],
  grafana: [],
  prometheus: [],
  datadog: [],
  sentry: [],
  cloudflare: [],
  vercel: [],
  netlify: [],
  heroku: [],
  digitalocean: [],

  // ── Testing ──────────────────────────────────────────────────────────────
  jest: [],
  vitest: [],
  cypress: [],
  playwright: [],
  testinglibrary: ['rtl'],
  selenium: [],
  mocha: [],
  postman: [],
  sonarqube: ['sonar'],

  // ── Mobile, games, media ─────────────────────────────────────────────────
  android: [],
  apple: ['ios', 'macos'],
  flutter: [],
  ionic: [],
  expo: [],
  unity: [],
  unrealengine: ['unreal'],
  blender: [],
  ffmpeg: [],
  qt: [],
}

const slugs = Object.keys(ICONS)
const res = await fetch(`${API}?icons=${slugs.join(',')}`)
if (!res.ok) throw new Error(`Iconify said ${res.status} ${res.statusText}`)

/** @type {{ icons: Record<string, { body: string }>, not_found?: string[] }} */
const data = await res.json()
if (data.not_found?.length) console.warn(`⚠ no such icon: ${data.not_found.join(', ')}`)

/** The same normalisation `iconPaths` applies to a lookup — see packages/render/src/icons.ts. */
const normalise = (s) =>
  s
    .toLowerCase()
    .replaceAll('&', 'and')
    .replaceAll(/[^a-z0-9+#]/g, '')

/** @type {Record<string, string>} alias → slug */
const aliases = {}
for (const [slug, names] of Object.entries(ICONS)) {
  if (!data.icons[slug]) continue
  for (const name of names) {
    const key = normalise(name)
    if (aliases[key]) console.warn(`⚠ "${name}" already points at ${aliases[key]}, not ${slug}`)
    aliases[key] = slug
  }
}

const bodies = Object.entries(data.icons)
  .toSorted(([a], [b]) => a.localeCompare(b))
  // The API hands back `fill="currentColor"` on every path; only the path data
  // is ever read (see iconPaths), so the repetition is dropped here.
  .map(([slug, icon]) => `  ${slug}: '${icon.body.replaceAll(' fill="currentColor"', '').replaceAll("'", "\\'")}',`)

const out = `/**
 * Brand logos for the chip variants — generated, do not edit.
 *
 * Written by scripts/gen-tech-icons.mjs from the Simple Icons set (CC0-1.0),
 * which is fetched there rather than depended on: the full collection is a few
 * thousand logos, and a CV spends the ${slugs.length} below. Run that script to add one.
 *
 * A body is the inside of a 24×24 \`<svg>\`; \`iconPaths\` in render/icons.js reads
 * its path data, and is what turns "Node.js" into \`nodedotjs\`.
 */

/** slug → the paths of its 24×24 icon. @type {Record<string, string>} */
export const ICON_BODIES = {
${bodies.join('\n')}
}

/** What a CV is likely to call one, normalised. @type {Record<string, string>} */
export const ICON_ALIASES = {
${Object.entries(aliases)
  .toSorted(([a], [b]) => a.localeCompare(b))
  .map(([alias, slug]) => `  ${/^[a-z][a-z0-9]*$/.test(alias) ? alias : `'${alias}'`}: '${slug}',`)
  .join('\n')}
}
`

await writeFile(OUT, out)
console.log(`${Object.keys(data.icons).length} icons, ${Object.keys(aliases).length} aliases → ${OUT}`)
