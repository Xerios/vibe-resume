// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
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

export {}
