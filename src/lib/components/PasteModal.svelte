<script>
  import Icon from '@iconify/svelte'
  import IconPilcrow from '@iconify-icons/lucide/pilcrow'
  import IconSparkles from '@iconify-icons/lucide/sparkles'
  import Modal from './Modal.svelte'

  /**
   * @typedef {object} Props
   * @property {import('$lib/cv/format/paste.js').PasteIssue} issue the paste being held back
   * @property {(choice: 'prompt' | 'basic' | 'raw') => void} onChoose what to do with it instead
   * @property {() => void} onClose
   */

  /** @type {Props} */
  let { issue, onChoose, onClose } = $props()

  const COPY = {
    markdown: {
      title: 'That looks like Markdown',
      body: 'The editor reads its own YAML-like format rather than Markdown. Pasted as it is, the headings would turn into comments and the preview would have little to show.',
    },
    html: {
      title: 'That is formatted text',
      body: 'It came from a web page or a word processor. The editor reads plain text in its own YAML-like format, so the formatting can’t come along as it is.',
    },
    invalid: {
      title: 'That isn’t a CV in this format',
      body: 'It would replace the whole document, but it doesn’t have the header and sections the preview is built from.',
    },
  }

  const copy = $derived(COPY[issue.kind])
</script>

<Modal title={copy.title} {onClose}>
  <p class="lede">{copy.body}</p>

  <div class="options">
    <button class="option" data-autofocus onclick={() => onChoose('prompt')}>
      <span class="icon"><Icon icon={IconSparkles} width="16" height="16" /></span>
      <span>
        <strong>Manually convert it with an AI assistant</strong>
        Copy a prompt that rewrites your CV in this format, then paste the reply back. The most faithful result.
      </span>
    </button>
    <button class="option" onclick={() => onChoose('basic')}>
      <span class="icon"><Icon icon={IconPilcrow} width="16" height="16" /></span>
      <span>
        <strong>Do a basic conversion</strong>
        {issue.kind === 'html' ? 'Keep headings, lists, bold and links, then make' : 'Make'} each heading a section and each line a paragraph{issue.whole
          ? ''
          : ', added at the end of your CV'}. Expect to tidy it up by hand.
      </span>
    </button>
  </div>

  {#snippet footer()}
    <button class="ds-btn subtle" onclick={onClose}>Cancel</button>
    <button class="ds-btn" onclick={() => onChoose('raw')}>Paste as is</button>
  {/snippet}
</Modal>

<style lang="scss">
  .lede {
    margin: 0 0 var(--ds-space-200);
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: var(--ds-space-100);
  }

  /* A whole row as the button, the way ADS lays out a choice that needs a
     sentence of explanation. */
  .option {
    display: flex;
    align-items: flex-start;
    gap: var(--ds-space-150);
    width: 100%;
    padding: var(--ds-space-150);
    text-align: left;
    font: var(--ds-font-body);
    color: var(--ds-text-subtle);
    background: none;
    border: var(--ds-border-width) solid var(--ds-border);
    border-radius: var(--ds-radius-medium);
    cursor: pointer;
    transition:
      background-color 100ms var(--ease),
      border-color 100ms var(--ease);

    &:hover {
      background: var(--ds-background-neutral-subtle-hovered);
    }

    &:focus-visible {
      outline: 2px solid var(--ds-border-focused);
      outline-offset: 2px;
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
</style>
