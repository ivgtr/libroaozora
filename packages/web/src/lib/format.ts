import type { Role } from "@libroaozora/core";

export function formatFullName(p: {
  lastName: string;
  firstName: string;
}): string {
  return `${p.lastName} ${p.firstName}`;
}

export function formatReading(p: {
  lastNameReading: string;
  firstNameReading: string;
}): string {
  return `${p.lastNameReading} ${p.firstNameReading}`;
}

export function formatDate(isoDate: string): string {
  return isoDate.slice(0, 10);
}

export function formatLifespan(
  birthDate?: string,
  deathDate?: string,
): string {
  return [birthDate, deathDate].filter(Boolean).join("\u2013");
}

const ROLE_LABELS: Record<Role, string> = {
  author: "著",
  translator: "翻訳",
  editor: "編集",
  reviser: "校訂",
};

export function translateRole(role: Role): string {
  return ROLE_LABELS[role];
}
