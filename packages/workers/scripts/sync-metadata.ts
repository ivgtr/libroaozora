import { execFileSync } from "node:child_process"
import { writeFileSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { decompress, parseCSV } from "@libroaozora/core"
import {
  METADATA_R2_KEY,
  META_WORKS_KEY,
  META_PERSONS_KEY,
  META_SYNCED_AT_KEY,
  METADATA_TTL,
} from "../src/lib/constants"

const CSV_URL =
  "https://raw.githubusercontent.com/aozorabunko/aozorabunko/master/index_pages/list_person_all_extended_utf8.zip"

const R2_BUCKET = "libroaozora-data"

function getNamespaceId(): string {
  const id = process.env.KV_NAMESPACE_ID
  if (!id) {
    throw new Error("KV_NAMESPACE_ID environment variable is required")
  }
  return id
}

function wranglerR2Put(key: string, data: string): void {
  execFileSync("wrangler", ["r2", "object", "put", `${R2_BUCKET}/${key}`, "--pipe", "--remote"], {
    input: data,
    stdio: ["pipe", "inherit", "inherit"],
  })
}

function wranglerKvPut(namespaceId: string, key: string, value: string, ttl?: number): void {
  const tmpFile = join(tmpdir(), `kv-${key.replace(/:/g, "-")}-${Date.now()}.json`)
  try {
    writeFileSync(tmpFile, value, "utf8")
    const args = ["kv", "key", "put", "--namespace-id", namespaceId, key, "--path", tmpFile]
    if (ttl) args.push("--ttl", String(ttl))
    execFileSync("wrangler", args, { stdio: "inherit" })
  } finally {
    try { unlinkSync(tmpFile) } catch {}
  }
}

async function main(): Promise<void> {
  const namespaceId = getNamespaceId()

  console.log("Downloading CSV zip...")
  const response = await fetch(CSV_URL)
  if (!response.ok) {
    throw new Error(`CSV fetch failed: ${response.status}`)
  }
  const zipData = new Uint8Array(await response.arrayBuffer())
  console.log(`Downloaded ${zipData.byteLength} bytes`)

  console.log("Parsing CSV...")
  const csvText = new TextDecoder().decode(decompress(zipData, ".csv"))
  const { works, persons } = parseCSV(csvText)
  console.log(`Parsed ${works.length} works, ${persons.length} persons`)

  const syncedAt = new Date().toISOString()
  const json = JSON.stringify({ works, persons, syncedAt })

  console.log("Writing to R2...")
  wranglerR2Put(METADATA_R2_KEY, json)
  console.log("R2 write complete")

  console.log("Writing to KV...")
  wranglerKvPut(namespaceId, META_WORKS_KEY, JSON.stringify(works), METADATA_TTL)
  wranglerKvPut(namespaceId, META_PERSONS_KEY, JSON.stringify(persons), METADATA_TTL)
  wranglerKvPut(namespaceId, META_SYNCED_AT_KEY, syncedAt)
  console.log("KV write complete")

  console.log(`Sync complete: ${works.length} works, ${persons.length} persons`)
}

main().catch((err) => {
  console.error("Sync failed:", err)
  process.exit(1)
})
