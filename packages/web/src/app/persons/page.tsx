import type { Metadata } from "next";
import { searchPersons } from "@/lib/api-client";
import { PersonCard } from "@/components/PersonCard";
import { Pagination } from "@/components/Pagination";
import { PersonSearchForm } from "./PersonSearchForm";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "人物一覧",
  description: "青空文庫に収録されている著者・翻訳者の一覧を検索できます",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PersonsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const name = typeof sp.name === "string" ? sp.name : "";
  const sort = typeof sp.sort === "string" ? sp.sort : "";
  const order = typeof sp.order === "string" ? sp.order : "";
  const page = typeof sp.page === "string" ? Number(sp.page) || 1 : 1;

  const params = new URLSearchParams();
  if (name) params.set("name", name);
  if (sort) params.set("sort", sort);
  if (order) params.set("order", order);
  params.set("page", String(page));

  const result = await searchPersons(params);

  const linkParams: Record<string, string> = {};
  if (name) linkParams.name = name;
  if (sort) linkParams.sort = sort;
  if (order) linkParams.order = order;

  return (
    <div>
      <h1 className={styles.heading}>人物一覧</h1>
      <PersonSearchForm
        key={`${name}-${sort}-${order}`}
        defaultName={name}
        defaultSort={sort}
        defaultOrder={order}
      />
      <p className={styles.summary}>{result.total} 人の人物</p>
      {result.items.length > 0 ? (
        <div className={styles.results}>
          {result.items.map((person) => (
            <PersonCard key={person.id} person={person} />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          該当する人物が見つかりませんでした
        </div>
      )}
      <Pagination
        total={result.total}
        page={result.page}
        perPage={result.perPage}
        baseHref="/persons"
        searchParams={linkParams}
      />
    </div>
  );
}
