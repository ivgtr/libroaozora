import { Suspense } from "react";
import { SearchForm } from "@/components/SearchForm";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <div className={styles.hero}>
      <h1 className={styles.title}>Libro Aozora</h1>
      <p className={styles.subtitle}>
        青空文庫の作品を検索・閲覧できるデモアプリケーション
      </p>
      <div className={styles.searchSection}>
        <Suspense>
          <SearchForm />
        </Suspense>
      </div>
    </div>
  );
}
