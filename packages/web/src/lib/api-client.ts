import { unstable_cache } from "next/cache";
import type {
  Work,
  Person,
  SearchResult,
  WorkContent,
  ErrorResponse,
} from "@libroaozora/core";

function getBaseUrl(): string {
  const url = process.env.API_BASE_URL;
  if (!url) {
    throw new Error("API_BASE_URL environment variable is not set");
  }
  return url;
}

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * モジュールレベルで定義したキャッシュ関数。
 * href を引数として受け取り、キャッシュキーに正しく組み込む。
 * 成功応答のみ 24h キャッシュ。throw はキャッシュされない。
 */
const cachedFetch = unstable_cache(
  async (href: string) => {
    const res = await fetch(href, { cache: "no-store" });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ErrorResponse | null;
      throw new ApiError(
        res.status,
        body?.error?.code ?? "UNKNOWN",
        body?.error?.message ?? `API error: ${res.status}`,
      );
    }

    return res.json();
  },
  ["api"],
  { revalidate: 86400 },
);

async function apiFetch<T>(path: string, params?: URLSearchParams): Promise<T> {
  const url = new URL(path, getBaseUrl());
  if (params) {
    for (const [key, value] of params) {
      if (value) url.searchParams.set(key, value);
    }
  }

  return cachedFetch(url.toString()) as Promise<T>;
}

export async function searchWorks(
  params: URLSearchParams,
): Promise<SearchResult<Work>> {
  return apiFetch<SearchResult<Work>>("/v1/works", params);
}

export async function getWork(id: string): Promise<Work> {
  return apiFetch<Work>(`/v1/works/${encodeURIComponent(id)}`);
}

export async function getWorkContent(id: string): Promise<WorkContent> {
  const params = new URLSearchParams({ format: "plain" });
  return apiFetch<WorkContent>(
    `/v1/works/${encodeURIComponent(id)}/content`,
    params,
  );
}

export async function searchPersons(
  params: URLSearchParams,
): Promise<SearchResult<Person>> {
  return apiFetch<SearchResult<Person>>("/v1/persons", params);
}

export async function getPerson(id: string): Promise<Person> {
  return apiFetch<Person>(`/v1/persons/${encodeURIComponent(id)}`);
}

export async function getPersonWorks(
  id: string,
  params?: URLSearchParams,
): Promise<SearchResult<Work>> {
  return apiFetch<SearchResult<Work>>(
    `/v1/persons/${encodeURIComponent(id)}/works`,
    params,
  );
}

export { ApiError };
