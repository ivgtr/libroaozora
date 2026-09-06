import { pathToFileURL } from "node:url"
import { randomUUID } from "node:crypto"
import { decompress } from "@libroaozora/core"
import { downloadMetadata } from "./download-metadata"
import { publishSnapshot, validateCSV } from "./metadata-sync"
import type { MetadataStore } from "./metadata-sync"

/** One serialized GitHub workflow is the only remote writer. Import has no effects. */
export async function main(): Promise<void> {
  if (process.env.GITHUB_ACTIONS !== "true") throw new Error("Run metadata publication through the serialized GitHub workflow")
  const token = process.env.CLOUDFLARE_API_TOKEN
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  const namespace = process.env.KV_NAMESPACE_ID
  const bucket = process.env.R2_BUCKET ?? "libroaozora-data"
  if (!token || !account || !namespace) throw new Error("Cloudflare token, account ID and KV namespace are required")
  const startedAt = new Date().toISOString()
  console.info("Metadata sync started", { startedAt })
  const zip = await downloadMetadata()
  const csv = new TextDecoder("utf-8", { fatal: true }).decode(decompress(zip, ".csv", { maxOutputBytes: 64 * 1024 * 1024 }))
  const data = validateCSV(csv)
  const request = async (path: string, method: "GET" | "PUT", body?: string) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}${path}`, {
      method, body, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" }, signal: AbortSignal.timeout(30_000),
    })
    if (method === "GET" && response.status === 404) { await response.body?.cancel(); return null }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Cloudflare storage ${method} failed: ${response.status}`) }
    return response.text()
  }
  const objectPath = (key: string) => `/r2/buckets/${encodeURIComponent(bucket)}/objects/${key.split("/").map(encodeURIComponent).join("/")}`
  const store: MetadataStore = {
    readR2: key => request(objectPath(key), "GET"),
    writeR2: async (key, value) => { await request(objectPath(key), "PUT", value) },
    writeKV: async (key, value, ttl) => { await request(`/storage/kv/namespaces/${encodeURIComponent(namespace)}/values/${encodeURIComponent(key)}?expiration_ttl=${ttl}`, "PUT", value) },
  }
  await publishSnapshot(store, { schemaVersion: 1, generation: `${Date.now()}-${randomUUID()}`, ...data, syncedAt: startedAt })
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  console.error("Metadata sync failed", { failedAt: new Date().toISOString(), error })
  process.exitCode = 1
})
