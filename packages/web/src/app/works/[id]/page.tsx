import type { Metadata } from "next";
import type { WorkContent } from "@libroaozora/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getWork, getWorkContent, ApiError } from "@/lib/api-client";
import { formatFullName, formatDate, translateRole } from "@/lib/format";
import { ContentReader, ContentUnavailable } from "@/components/ContentReader";
import styles from "./page.module.css";

type ContentState =
  | { kind: "content"; data: WorkContent }
  | { kind: "unavailable"; reason: "copyright" | "no-text" | "error" };

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const work = await getWork(id);
    return { title: work.title };
  } catch {
    return { title: "作品詳細" };
  }
}

export default async function WorkDetailPage({ params }: Props) {
  const { id } = await params;

  let work;
  try {
    work = await getWork(id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      notFound();
    }
    throw e;
  }

  const authors = work.authors.map((a) => ({
    id: a.id,
    name: formatFullName(a),
    role: a.role,
  }));

  let contentState: ContentState;

  if (work.copyrightFlag) {
    contentState = { kind: "unavailable", reason: "copyright" };
  } else if (!work.sourceUrls.text && !work.sourceUrls.html) {
    contentState = { kind: "unavailable", reason: "no-text" };
  } else {
    try {
      const data = await getWorkContent(id);
      contentState = { kind: "content", data };
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        contentState = { kind: "unavailable", reason: "copyright" };
      } else if (e instanceof ApiError && e.status === 404) {
        contentState = { kind: "unavailable", reason: "no-text" };
      } else {
        contentState = { kind: "unavailable", reason: "error" };
      }
    }
  }

  return (
    <div>
      <Link href="/works" className={styles.backLink}>
        ← 作品検索
      </Link>

      <div className={styles.header}>
        <h1 className={styles.title}>{work.title}</h1>
        {work.subtitle && (
          <div className={styles.subtitle}>{work.subtitle}</div>
        )}
        <div className={styles.authors}>
          {authors.map((a, i) => (
            <span key={a.id}>
              {i > 0 && "、"}
              <Link
                href={`/persons/${a.id}`}
                className={styles.authorLink}
              >
                {a.name}
              </Link>
              {a.role !== "author" && (
                <span>（{translateRole(a.role)}）</span>
              )}
            </span>
          ))}
        </div>
        <div className={styles.metaTable}>
          {work.ndc && (
            <>
              <span className={styles.metaLabel}>NDC 分類</span>
              <span className={styles.metaValue}>{work.ndc}</span>
            </>
          )}
          {work.orthography && (
            <>
              <span className={styles.metaLabel}>表記法</span>
              <span className={styles.metaValue}>{work.orthography}</span>
            </>
          )}
          <span className={styles.metaLabel}>公開日</span>
          <span className={styles.metaValue}>
            {formatDate(work.publishedAt)}
          </span>
          <span className={styles.metaLabel}>更新日</span>
          <span className={styles.metaValue}>
            {formatDate(work.updatedAt)}
          </span>
        </div>
        {work.sourceUrls.card && (
          <a
            href={work.sourceUrls.card}
            className={styles.cardLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            青空文庫のカードページ →
          </a>
        )}
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>本文</h2>
        {contentState.kind === "content" ? (
          <ContentReader content={contentState.data} />
        ) : (
          <ContentUnavailable reason={contentState.reason} />
        )}
      </section>
    </div>
  );
}
