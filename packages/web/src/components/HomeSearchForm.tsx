"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import styles from "./HomeSearchForm.module.css";

export function HomeSearchForm() {
  const router = useRouter();

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const title = (new FormData(e.currentTarget).get("title") as string) ?? "";
      if (title.trim()) {
        router.push(`/works?title=${encodeURIComponent(title.trim())}`);
      }
    },
    [router],
  );

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <input
        name="title"
        type="text"
        className={styles.input}
        placeholder="作品名で検索"
      />
      <button type="submit" className={styles.button}>
        検索
      </button>
    </form>
  );
}
