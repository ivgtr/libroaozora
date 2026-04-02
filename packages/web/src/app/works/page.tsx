import type { Metadata } from "next";
import { Suspense } from "react";
import { searchWorks } from "@/lib/api-client";
import { SearchForm } from "@/components/SearchForm";
import { WorkCard } from "@/components/WorkCard";
import { Pagination } from "@/components/Pagination";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "作品検索",
  description: "青空文庫の作品をタイトルや著者名で検索できます",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorksPage({ searchParams }: Props) {
  const sp = await searchParams;
  const title = typeof sp.title === "string" ? sp.title : "";
  const author = typeof sp.author === "string" ? sp.author : "";
  const sort = typeof sp.sort === "string" ? sp.sort : "";
  const order = typeof sp.order === "string" ? sp.order : "";
  const page = typeof sp.page === "string" ? Number(sp.page) || 1 : 1;

  const hasQuery = !!(title || author);

  const params = new URLSearchParams();
  if (title) params.set("title", title);
  if (author) params.set("author", author);
  if (sort) params.set("sort", sort);
  if (order) params.set("order", order);
  params.set("page", String(page));

  const result = hasQuery ? await searchWorks(params) : null;

  const linkParams: Record<string, string> = {};
  if (title) linkParams.title = title;
  if (author) linkParams.author = author;
  if (sort) linkParams.sort = sort;
  if (order) linkParams.order = order;

  return (
    <div>
      <h1 className={styles.heading}>作品検索</h1>
      <Suspense>
        <SearchForm key={`${title}-${author}-${sort}-${order}`} />
      </Suspense>
      {result !== null && (
        <>
          <p className={styles.summary}>{result.total} 件の作品が見つかりました</p>
          {result.items.length > 0 ? (
            <div className={styles.results}>
              {result.items.map((work) => (
                <WorkCard key={work.id} work={work} />
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              該当する作品が見つかりませんでした
            </div>
          )}
          <Pagination
            total={result.total}
            page={result.page}
            perPage={result.perPage}
            baseHref="/works"
            searchParams={linkParams}
          />
        </>
      )}
    </div>
  );
}
