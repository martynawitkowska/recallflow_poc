import type { ReactNode } from "react";

export type IconName = "book" | "check" | "key" | "logo" | "upload";

type IconProps = {
  name: IconName;
  size?: number;
};

const paths: Record<IconName, ReactNode> = {
  book: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5Z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5Z" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  key: (
    <>
      <circle cx="8.5" cy="15.5" r="4.5" />
      <path d="m12 12 8-8M16 8l2 2M14 10l2 2" />
    </>
  ),
  logo: (
    <>
      <path d="M5 4h6v16H7a3 3 0 0 0-3 3V5a1 1 0 0 1 1-1Z" />
      <path d="M19 4h-6v16h4a3 3 0 0 1 3 3V5a1 1 0 0 0-1-1Z" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M5 14v5h14v-5" />
    </>
  ),
};

export default function Icon({ name, size = 18 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
    >
      {paths[name]}
    </svg>
  );
}
