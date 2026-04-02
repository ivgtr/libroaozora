"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { buildSearchUrl } from "@/lib/navigation";
import styles from "./page.module.css";

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
    <form className={styles.searchGroup} onSubmit={handleSubmit}>
      <input
        name="name"
        type="text"
        className={styles.input}
        defaultValue={defaultName}
        placeholder="人物名を入力"
      />
      <select name="sort" className={styles.select} defaultValue={defaultSort}>
        <option value="">並び替えなし</option>
        <option value="name">名前順</option>
      </select>
      <select name="order" className={styles.select} defaultValue={defaultOrder}>
        <option value="">指定なし</option>
        <option value="asc">昇順</option>
        <option value="desc">降順</option>
      </select>
      <button type="submit" className={styles.button}>
        検索
      </button>
    </form>
  );
}
