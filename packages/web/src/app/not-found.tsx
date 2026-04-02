import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>ページが見つかりません</h2>
      <p className={styles.message}>
        お探しのページは存在しないか、移動した可能性があります
      </p>
      <Link href="/" className={styles.link}>
        トップページに戻る
      </Link>
    </div>
  );
}
