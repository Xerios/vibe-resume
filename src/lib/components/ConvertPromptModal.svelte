<script>
  import Icon from '@iconify/svelte'
  import IconCheck from '@iconify-icons/lucide/check'
  import IconCopy from '@iconify-icons/lucide/copy'
  import { conversionPrompt, looksLikeCv, stripFence } from '$lib/cv/format/paste.js'
  import Modal from './Modal.svelte'

  /**
   * @typedef {object} Props
   * @property {string} source the CV to convert, as Markdown or plain text
   * @property {(text: string) => void} onApply the converted document, to replace the current one with
   * @property {() => void} onClose
   */

  /** @type {Props} */
  let { source, onApply, onClose } = $props()

  const prompt = $derived(conversionPrompt(source))

  let copied = $state(/** @type {'no' | 'yes' | 'failed'} */ ('no'))
  let reply = $state('')
  /** @type {HTMLTextAreaElement | undefined} */
  let promptArea = $state(undefined)
  let showPrompt = $state(false)

  const result = $derived(stripFence(reply))
  const valid = $derived(result.trim() !== '' && looksLikeCv(result))

  function copy() {
    navigator.clipboard
      .writeText(prompt)
      .then(() => (copied = 'yes'))
      .catch(() => {
        // Left to the user's own Ctrl+C, with the text already selected for it.
        copied = 'failed'
        showPrompt = true
        queueMicrotask(() => promptArea?.select())
      })
  }
</script>

<Modal title="Convert with an AI assistant" width={560} {onClose}>
  <ol class="steps">
    <li>
      <strong>Copy the prompt.</strong>
      It describes the format and has your CV in it.
      <div class="row">
        <button class="ds-btn primary" data-autofocus onclick={copy}>
          <Icon icon={copied === 'yes' ? IconCheck : IconCopy} width="16" height="16" />
          {copied === 'yes' ? 'Copied' : 'Copy prompt'}
        </button>
        <button class="ds-btn subtle" aria-expanded={showPrompt} onclick={() => (showPrompt = !showPrompt)}>
          {showPrompt ? 'Hide prompt' : 'Show prompt'}
        </button>
      </div>
      {#if copied === 'failed'}
        <p class="error">Couldn’t reach the clipboard — the prompt is selected below, copy it with Ctrl+C.</p>
      {/if}
      {#if showPrompt}
        <textarea class="prompt" readonly rows="8" value={prompt} bind:this={promptArea}></textarea>
      {/if}
    </li>
    <li>
      <strong>Paste it into the AI assistant you use</strong>
      — ChatGPT, Claude, Gemini or any other. That sends your CV to that service; nothing here does.
    </li>
    <li>
      <strong>Paste the reply here.</strong>
      <textarea class="reply" rows="8" spellcheck="false" placeholder={'header:\n  name: …\nsections:\n  - type: text'} bind:value={reply}></textarea>
      {#if reply.trim() && !valid}
        <p class="error">That isn’t a CV in this format yet — it needs a header or sections. Paste the whole reply, or ask the assistant to fix it.</p>
      {/if}
    </li>
  </ol>

  {#snippet footer()}
    <span class="note">Replaces the whole document. Undo brings it back.</span>
    <button class="ds-btn subtle" onclick={onClose}>Cancel</button>
    <button class="ds-btn primary" disabled={!valid} onclick={() => onApply(result)}>Replace document</button>
  {/snippet}
</Modal>

<style lang="scss">
  .steps {
    margin: 0;
    padding-left: var(--ds-space-250);
    display: flex;
    flex-direction: column;
    gap: var(--ds-space-200);
    color: var(--ds-text-subtle);

    strong {
      color: var(--ds-text);
    }
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ds-space-100);
    margin-top: var(--ds-space-100);

    .ds-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--ds-space-075);
    }
  }

  textarea {
    display: block;
    box-sizing: border-box;
    width: 100%;
    margin-top: var(--ds-space-100);
    padding: var(--ds-space-100);
    font: var(--ds-font-code);
    color: var(--ds-text);
    background: var(--ds-background-input);
    border: var(--ds-border-width) solid var(--ds-border-input);
    border-radius: var(--ds-radius-medium);
    resize: vertical;

    &:focus {
      outline: 2px solid var(--ds-border-focused);
      outline-offset: -1px;
    }
  }

  .prompt {
    color: var(--ds-text-subtle);
  }

  .error {
    margin: var(--ds-space-075) 0 0;
    font: var(--ds-font-body-small);
    color: var(--ds-text-danger);
  }

  .note {
    flex: 1;
    align-self: center;
    font: var(--ds-font-body-small);
    color: var(--ds-text-subtlest);
  }
</style>
