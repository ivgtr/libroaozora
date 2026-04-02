"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { buildSearchUrl } from "@/lib/navigation";
import styles from "./PersonSearchForm.module.css";

type Props = {
  defaultName: string;
  defaultSort: string;
  defaultOrder: string;
};

export function PersonSearchForm({ defaultName, defaultSort, defaultOrder }: Props) {
  const router = useRouter();

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      router.push(
        buildSearchUrl("/persons", {
          name: (fd.get("name") as string) ?? "",
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
          name="name"
          type="text"
          className={styles.input}
          defaultValue={defaultName}
          placeholder="人物名"
        />
        <button type="submit" className={styles.button}>
          検索
        </button>
      </div>
      <div className={styles.sortRow}>
        <span className={styles.sortLabel}>並び替え</span>
        <select name="sort" className={styles.select} defaultValue={defaultSort}>
          <option value="">指定なし</option>
          <option value="name">名前順</option>
        </select>
        <select name="order" className={styles.select} defaultValue={defaultOrder}>
          <option value="">指定なし</option>
          <option value="asc">昇順</option>
          <option value="desc">降順</option>
        </select>
      </div>
    </form>
  );
}
