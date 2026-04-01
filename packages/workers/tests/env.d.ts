/// <reference types="@cloudflare/vitest-pool-workers/types" />

declare namespace Cloudflare {
  interface Env {
    KV: KVNamespace;
  }
  interface GlobalProps {
    mainModule: { default: ExportedHandler<Env> };
  }
}
