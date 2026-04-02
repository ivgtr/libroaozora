type Props = {
  size?: number;
};

export function CloudIcon({ size = 18 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="12.5" r="5" fill="#8FAFC4" />
      <circle cx="7" cy="15" r="3" fill="#8FAFC4" />
      <circle cx="17.5" cy="14" r="3.5" fill="#8FAFC4" />
      <rect x="4" y="15" width="17" height="3" fill="#8FAFC4" />
    </svg>
  );
}
