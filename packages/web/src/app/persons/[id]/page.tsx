import type { Metadata } from "next";
import type { SearchResult, Work } from "@libroaozora/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPerson, getPersonWorks, ApiError } from "@/lib/api-client";
import { formatFullName, formatReading, formatLifespan } from "@/lib/format";
import { WorkCard } from "@/components/WorkCard";
import styles from "./page.module.css";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const person = await getPerson(id);
    const name = formatFullName(person);
    return {
      title: name,
      description: `${name}の著者情報と著作一覧（${person.worksCount}作品）`,
    };
  } catch {
    return { title: "人物詳細" };
  }
}

export default async function PersonDetailPage({ params }: Props) {
  const { id } = await params;

  let person;
  try {
    person = await getPerson(id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      notFound();
    }
    throw e;
  }

  let worksResult: SearchResult<Work> | null;
  try {
    worksResult = await getPersonWorks(id);
  } catch {
    worksResult = null;
  }

  const fullName = formatFullName(person);
  const reading = formatReading(person);
  const dates = formatLifespan(person.birthDate, person.deathDate);

  return (
    <div>
      <Link href="/persons" className={styles.backLink}>
        ← 人物一覧
      </Link>

      <div className={styles.header}>
        <h1 className={styles.name}>{fullName}</h1>
        <div className={styles.reading}>{reading}</div>
        <div className={styles.metaTable}>
          {dates && (
            <>
              <span className={styles.metaLabel}>生没年</span>
              <span className={styles.metaValue}>{dates}</span>
            </>
          )}
          {person.lastNameRomaji && (
            <>
              <span className={styles.metaLabel}>ローマ字</span>
              <span className={styles.metaValue}>
                {person.lastNameRomaji} {person.firstNameRomaji}
              </span>
            </>
          )}
          <span className={styles.metaLabel}>著作数</span>
          <span className={styles.metaValue}>{person.worksCount}</span>
        </div>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>著作一覧</h2>
        {worksResult === null ? (
          <div className={styles.emptyWorks}>
            著作一覧の取得に失敗しました
          </div>
        ) : worksResult.items.length > 0 ? (
          <div className={styles.works}>
            {worksResult.items.map((work) => (
              <WorkCard key={work.id} work={work} />
            ))}
          </div>
        ) : (
          <div className={styles.emptyWorks}>著作がありません</div>
        )}
      </section>
    </div>
  );
}
