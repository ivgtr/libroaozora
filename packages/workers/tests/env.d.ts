/// <reference types="@cloudflare/vitest-pool-workers/types" />

declare namespace Cloudflare {
  interface Env {
    KV: KVNamespace;
    R2: R2Bucket;
  }
  interface GlobalProps {
    mainModule: { default: ExportedHandler<Env> };
  }
}
