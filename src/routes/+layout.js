// CodeMirror and the Loro WASM runtime are browser-only, and every byte of state lives in
// localStorage — there is nothing meaningful to render on a server.
export const ssr = false;
export const prerender = true;
