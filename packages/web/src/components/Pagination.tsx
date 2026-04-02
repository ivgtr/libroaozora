import Link from "next/link";
import styles from "./Pagination.module.css";

type Props = {
  total: number;
  page: number;
  perPage: number;
  baseHref: string;
  searchParams: Record<string, string>;
};

export function Pagination({
  total,
  page,
  perPage,
  baseHref,
  searchParams,
}: Props) {
  if (total <= 0 || perPage <= 0) return null;
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;

  function buildHref(p: number) {
    const params = new URLSearchParams(searchParams);
    if (p > 1) {
      params.set("page", String(p));
    } else {
      params.delete("page");
    }
    const qs = params.toString();
    return qs ? `${baseHref}?${qs}` : baseHref;
  }

  const pages = getPageNumbers(page, totalPages);

  return (
    <div>
      <nav className={styles.nav} aria-label="ページネーション">
        {page > 1 && (
          <Link href={buildHref(page - 1)} className={styles.link}>
            前へ
          </Link>
        )}
        {pages.map((p, i) =>
          p === null ? (
            <span key={`e${i}`} className={styles.ellipsis}>
              ...
            </span>
          ) : p === page ? (
            <span key={p} className={styles.current} aria-current="page">
              {p}
            </span>
          ) : (
            <Link key={p} href={buildHref(p)} className={styles.link}>
              {p}
            </Link>
          ),
        )}
        {page < totalPages && (
          <Link href={buildHref(page + 1)} className={styles.link}>
            次へ
          </Link>
        )}
      </nav>
      <div className={styles.info}>
        {total} 件中 {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} 件
      </div>
    </div>
  );
}

function getPageNumbers(
  current: number,
  total: number,
): (number | null)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | null)[] = [1];

  if (current > 3) pages.push(null);

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) pages.push(null);

  pages.push(total);

  return pages;
}
