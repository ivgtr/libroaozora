export interface Env {
	CONTENT_MAX_CONCURRENT?: string;
	CONTENT_COOLDOWN_ENTRIES?: string;
	CONTENT_MAX_ZIP_BYTES?: string;
	CONTENT_MAX_OUTPUT_BYTES?: string;
	CONTENT_TIMEOUT_MS?: string;
	KV: KVNamespace;
	R2: R2Bucket;
}
