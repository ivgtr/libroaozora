import Link from "next/link";
import type { Work } from "@libroaozora/core";
import { formatFullName, formatDate } from "@/lib/format";
import styles from "./WorkCard.module.css";

type Props = {
  work: Work;
};

export function WorkCard({ work }: Props) {
  const authorNames = work.authors.map((a) => formatFullName(a)).join("、");

  return (
    <Link href={`/works/${work.id}`} className={styles.card}>
      <div className={styles.title}>
        {work.title}
        {work.copyrightFlag && (
          <span className={styles.copyrightBadge}>著作権存続</span>
        )}
      </div>
      {authorNames && <div className={styles.authors}>{authorNames}</div>}
      <div className={styles.meta}>
        <span>公開: {formatDate(work.publishedAt)}</span>
        <span>更新: {formatDate(work.updatedAt)}</span>
        {work.ndc && <span>NDC: {work.ndc}</span>}
      </div>
    </Link>
  );
}
