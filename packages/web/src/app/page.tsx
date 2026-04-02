import { Suspense } from "react";
import { CloudIcon } from "@/components/CloudIcon";
import { HomeSearchForm } from "@/components/HomeSearchForm";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <div className={styles.hero}>
      <h1 className={styles.title}>
        <CloudIcon size={24} />
        Libro Aozora
      </h1>
      <p className={styles.subtitle}>
        青空文庫の作品を検索・閲覧できます
      </p>
      <Suspense>
        <HomeSearchForm />
      </Suspense>
    </div>
  );
}
