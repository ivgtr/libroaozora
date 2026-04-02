"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { buildSearchUrl } from "@/lib/navigation";
import styles from "./SearchForm.module.css";

export function SearchForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const title = searchParams.get("title") ?? "";
  const author = searchParams.get("author") ?? "";
  const sort = searchParams.get("sort") ?? "";
  const order = searchParams.get("order") ?? "";

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      router.push(
        buildSearchUrl("/works", {
          title: (fd.get("title") as string) ?? "",
          author: (fd.get("author") as string) ?? "",
          sort: (fd.get("sort") as string) ?? "",
          order: (fd.get("order") as string) ?? "",
        }),
      );
    },
    [router],
  );

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.inputRow}>
        <input
          name="title"
          type="text"
          className={styles.input}
          defaultValue={title}
          placeholder="作品名"
        />
        <input
          name="author"
          type="text"
          className={styles.input}
          defaultValue={author}
          placeholder="著者名"
        />
        <button type="submit" className={styles.button}>
          検索
        </button>
      </div>
      <div className={styles.sortRow}>
        <span className={styles.sortLabel}>並び替え</span>
        <select name="sort" className={styles.select} defaultValue={sort}>
          <option value="">指定なし</option>
          <option value="published_at">公開日</option>
          <option value="updated_at">更新日</option>
        </select>
        <select name="order" className={styles.select} defaultValue={order}>
          <option value="">指定なし</option>
          <option value="asc">昇順</option>
          <option value="desc">降順</option>
        </select>
      </div>
    </form>
  );
}
