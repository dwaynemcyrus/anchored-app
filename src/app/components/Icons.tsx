import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconFrame({ children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      viewBox="0 0 24 24"
      width="18"
      {...props}
    >
      {children}
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m8 12 2.5 2.5L16 9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </IconFrame>
  );
}

export function ChevronIcon({ className = "", ...props }: IconProps) {
  return (
    <IconFrame className={`chevron-icon ${className}`} {...props}>
      <path
        d="m9 6 6 6-6 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </IconFrame>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M7 3.75h6.5L18 8.2v12.05H7z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path d="M13.5 3.75V8.2H18" stroke="currentColor" strokeWidth="1.5" />
    </IconFrame>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M3.75 6.75h6l1.5 2h9v10.5H3.75z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </IconFrame>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M5 7.5h14M5 12h14M5 16.5h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </IconFrame>
  );
}

export function NewFileIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M5.5 3.75H13l4.5 4.45v12.05h-12z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M13 3.75V8.2h4.5M8.5 14h6M11.5 11v6"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </IconFrame>
  );
}

export function NewFolderIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M3.75 7h6l1.5 2h9v9.25H3.75z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M12 12.25h4M14 10.25v4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </IconFrame>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle
        cx="10.5"
        cy="10.5"
        r="5.75"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="m15 15 4.25 4.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </IconFrame>
  );
}

export function NotificationIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M6.5 10.5a5.5 5.5 0 0 1 11 0c0 4 1.75 5 1.75 5H4.75s1.75-1 1.75-5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M9.75 18.25a2.5 2.5 0 0 0 4.5 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </IconFrame>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 4.5v2M12 17.5v2M19.5 12h-2M6.5 12h-2M17.3 6.7l-1.4 1.4M8.1 15.9l-1.4 1.4M17.3 17.3l-1.4-1.4M8.1 8.1 6.7 6.7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </IconFrame>
  );
}
