import Link from "next/link";
import type { Person } from "@libroaozora/core";
import { formatFullName, formatReading, formatLifespan } from "@/lib/format";
import styles from "./PersonCard.module.css";

type Props = {
  person: Person;
};

export function PersonCard({ person }: Props) {
  const dates = formatLifespan(person.birthDate, person.deathDate);

  return (
    <Link href={`/persons/${person.id}`} className={styles.card}>
      <div className={styles.name}>{formatFullName(person)}</div>
      <div className={styles.reading}>{formatReading(person)}</div>
      <div className={styles.meta}>
        {dates && <span>{dates}</span>}
        <span>{person.worksCount} 作品</span>
      </div>
    </Link>
  );
}
