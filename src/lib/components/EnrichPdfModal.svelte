<script>
  import Icon from '@iconify/svelte'
  import IconBraces from '@iconify-icons/lucide/braces'
  import IconAlert from '@iconify-icons/lucide/circle-alert'
  import IconCheck from '@iconify-icons/lucide/circle-check'
  import IconFileUp from '@iconify-icons/lucide/file-up'
  import IconTags from '@iconify-icons/lucide/tags'
  import IconUser from '@iconify-icons/lucide/user-round'
  import { toStrictYaml } from '$lib/cv/format/strict-yaml.js'
  import { PdfError, enrichPdf, mismatch, readPdf } from '$lib/cv/pdf/enrich.js'
  import Modal from './Modal.svelte'

  /**
   * After an export: the browser has written the PDF with a title and nothing
   * else, and only the user can hand that file back. Dropped here, it is
   * checked against what was exported — the CV's name in its title, and made
   * no earlier than the export — and saved again with the rest. See
   * pdf/enrich.js for what is added and how.
   *
   * @typedef {object} Props
   * @property {import('$lib/cv/state/ui.svelte.js').PdfExport} exported
   * @property {() => void} onClose
   */

  /** @type {Props} */
  let { exported, onClose } = $props()

  /** @type {{ kind: 'idle' } | { kind: 'busy' } | { kind: 'error', message: string } | { kind: 'done', name: string }} */
  let status = $state({ kind: 'idle' })
  let dragging = $state(false)

  /** @type {HTMLInputElement} */
  let input

  const meta = $derived(exported.meta)

  /** @param {File | null | undefined} file */
  async function take(file) {
    if (!file || status.kind === 'busy') return
    status = { kind: 'busy' }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const wrong = mismatch(readPdf(bytes), { title: meta.title, since: exported.since })
      if (wrong) {
        status = { kind: 'error', message: wrong }
        return
      }
      const enc = new TextEncoder()
      const out = await enrichPdf(bytes, {
        meta,
        attachments: [
          { name: 'cv.yaml', mime: 'application/yaml', description: 'This CV’s source, as YAML', data: enc.encode(toStrictYaml(exported.yaml)) },
          { name: 'cv.json', mime: 'application/json', description: 'This CV, as JSON', data: enc.encode(JSON.stringify(exported.cv, null, 2)) },
        ],
      })
      status = (await save(out, file.name)) ? { kind: 'done', name: file.name } : { kind: 'idle' }
    } catch (e) {
      status = { kind: 'error', message: e instanceof PdfError ? e.message : 'That file couldn’t be read.' }
    }
  }

  /**
   * Through the save dialog where there is one, so the file can go straight
   * over the one the browser printed; a download where there isn't, which the
   * browser will name beside it.
   * @param {Uint8Array} bytes
   * @param {string} name
   * @returns {Promise<boolean>} false if the user backed out of the dialog
   */
  async function save(bytes, name) {
    const blob = new Blob([/** @type {BlobPart} */ (bytes)], { type: 'application/pdf' })
    const picker = /** @type {any} */ (window).showSaveFilePicker
    if (picker) {
      try {
        const handle = await picker({ suggestedName: name, types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] })
        const writable = await handle.createWritable()
        await writable.write(blob)
        await writable.close()
        return true
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return false
        throw e
      }
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
    return true
  }

  /** Only a drag that carries files; a dragged selection is someone else's business. @param {DragEvent} e */
  const carriesFiles = (e) => e.dataTransfer?.types.includes('Files') ?? false
</script>

<!-- The whole window takes the drop while the dialog is up: a file let go a
     little wide of the zone would otherwise be opened by the browser in place
     of the app. -->
<svelte:window
  ondragover={(e) => {
    if (!carriesFiles(e)) return
    e.preventDefault()
    dragging = true
  }}
  ondragleave={(e) => {
    if (!e.relatedTarget) dragging = false
  }}
  ondrop={(e) => {
    if (!carriesFiles(e)) return
    e.preventDefault()
    dragging = false
    take(e.dataTransfer?.files[0])
  }}
/>

<Modal title="Add what your browser left out" width={520} {onClose}>
  {#if status.kind === 'done'}
    <div class="ds-section-message success">
      <Icon icon={IconCheck} width="24" height="24" />
      <div>
        <div class="ds-section-message-title">Saved {status.name}</div>
        It now carries its author, subject, keywords and your CV as data. If your browser saved it as a second file, that one is the copy to send.
      </div>
    </div>
  {:else}
    <p class="lede">Browsers save a PDF with its title and little else. If you saved one, drop it back here and it will also carry:</p>

    <ul class="adds">
      <li>
        <span class="icon"><Icon icon={IconUser} width="16" height="16" /></span>
        <span>
          <strong>Author, subject and keywords</strong>
          {meta.author || 'Your name'}, the start of your summary and {meta.keywords.length}
          {meta.keywords.length === 1 ? 'skill' : 'skills'} — what search, document managers and recruiting tools index a file by.
        </span>
      </li>
      <li>
        <span class="icon"><Icon icon={IconTags} width="16" height="16" /></span>
        <span>
          <strong>The same, as XMP</strong>
          The metadata format archives and PDF tools read.
        </span>
      </li>
      <li>
        <span class="icon"><Icon icon={IconBraces} width="16" height="16" /></span>
        <span>
          <strong>Your CV as data</strong>
          Its YAML and a JSON copy, attached inside the PDF for anything that would rather read data than the page.
        </span>
      </li>
    </ul>

    <div class="zone" class:dragging aria-busy={status.kind === 'busy'}>
      <Icon icon={IconFileUp} width="24" height="24" />
      <span>{status.kind === 'busy' ? 'Reading…' : 'Drop the PDF here'}</span>
      <button class="ds-btn compact" data-autofocus disabled={status.kind === 'busy'} onclick={() => input.click()}>Choose the PDF…</button>
      <input
        bind:this={input}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onchange={(e) => {
          take(e.currentTarget.files?.[0])
          e.currentTarget.value = ''
        }}
      />
    </div>

    {#if status.kind === 'error'}
      <div class="ds-section-message danger" role="alert">
        <Icon icon={IconAlert} width="24" height="24" />
        <div>{status.message}</div>
      </div>
    {/if}

    <p class="note">The pages aren’t changed, and nothing is uploaded — the file is read and written in this browser.</p>
  {/if}

  {#snippet footer()}
    {#if status.kind === 'done'}
      <button class="ds-btn primary" onclick={onClose}>Done</button>
    {:else}
      <button class="ds-btn subtle" onclick={onClose}>Not now</button>
    {/if}
  {/snippet}
</Modal>

<style lang="scss">
  .lede {
    margin: 0 0 var(--ds-space-150);
  }

  .adds {
    display: flex;
    flex-direction: column;
    gap: var(--ds-space-150);
    margin: 0 0 var(--ds-space-200);
    padding: 0;
    list-style: none;

    li {
      display: flex;
      align-items: flex-start;
      gap: var(--ds-space-150);
      color: var(--ds-text-subtle);
    }

    strong {
      display: block;
      font: var(--ds-font-heading-xsmall);
      color: var(--ds-text);
      margin-bottom: var(--ds-space-025);
    }
  }

  .icon {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: var(--ds-radius-medium);
    background: var(--ds-background-selected);
    color: var(--ds-icon-brand);
  }

  .zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--ds-space-100);
    padding: var(--ds-space-300) var(--ds-space-200);
    color: var(--ds-text-subtle);
    border: 2px dashed var(--ds-border);
    border-radius: var(--ds-radius-large);
    transition:
      background-color 100ms var(--ease),
      border-color 100ms var(--ease);

    &.dragging {
      border-color: var(--ds-border-selected);
      background: var(--ds-background-selected);
      color: var(--ds-text-selected);
    }
  }

  .ds-section-message {
    margin-top: var(--ds-space-200);
  }

  .note {
    margin: var(--ds-space-200) 0 0;
    font: var(--ds-font-body-small);
    color: var(--ds-text-subtlest);
  }
</style>
