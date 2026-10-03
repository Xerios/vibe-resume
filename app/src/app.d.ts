// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

/**
 * One side of a comparison: a file at a version, `null` being its newest text.
 * Exported so this file is a module, which `declare global` needs it to be.
 */
export interface CompareSource {
  fileId: string
  versionKey: string | null
}

declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    /**
     * Shallow-routing state: the compare dialog is a history entry, so that
     * Back closes it — which on a phone is how a dialog is expected to close.
     */
    interface PageState {
      compare?: { left: CompareSource; right: CompareSource }
    }
    // interface Platform {}
  }

  /**
   * PWA surfaces the DOM lib does not carry yet. Both are Chromium-only, and both
   * are reached optionally in `+page.svelte` so nothing assumes they exist.
   */
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>
    readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }

  /** Delivered when the OS opens a file the installed app is registered for. */
  interface LaunchParams {
    readonly files: readonly FileSystemFileHandle[]
  }

  interface Window {
    launchQueue?: { setConsumer(consumer: (params: LaunchParams) => void): void }
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
  }
}
