import {
  Bell,
  CheckCircle2,
  ChevronRight,
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FilePlus2,
  FileText,
  FileVideo,
  Folder,
  FolderPlus,
  Menu,
  Pencil,
  Search,
  Settings,
  Trash2,
  type LucideProps,
} from "lucide-react";

import { fileTypeForName, type FileType } from "../fileTypes";

export type IconProps = LucideProps;

const iconProps: Partial<LucideProps> = {
  "aria-hidden": true,
  size: 18,
  strokeWidth: 1.5,
};

export function CheckIcon(props: IconProps) {
  return <CheckCircle2 {...iconProps} {...props} />;
}

export function ChevronIcon({ className = "", ...props }: IconProps) {
  return (
    <ChevronRight
      {...iconProps}
      {...props}
      className={`chevron-icon ${className}`}
    />
  );
}

export function FileIcon(props: IconProps) {
  return <FileText {...iconProps} {...props} />;
}

export function FolderIcon(props: IconProps) {
  return <Folder {...iconProps} {...props} />;
}

export function MenuIcon(props: IconProps) {
  return <Menu {...iconProps} {...props} />;
}

export function NewFileIcon(props: IconProps) {
  return <FilePlus2 {...iconProps} {...props} />;
}

export function NewFolderIcon(props: IconProps) {
  return <FolderPlus {...iconProps} {...props} />;
}

export function RenameIcon(props: IconProps) {
  return <Pencil {...iconProps} {...props} />;
}

export function TrashIcon(props: IconProps) {
  return <Trash2 {...iconProps} {...props} />;
}

export function SearchIcon(props: IconProps) {
  return <Search {...iconProps} {...props} />;
}

export function NotificationIcon(props: IconProps) {
  return <Bell {...iconProps} {...props} />;
}

export function SettingsIcon(props: IconProps) {
  return <Settings {...iconProps} {...props} />;
}

function fileIconForType(type: FileType) {
  switch (type) {
    case "archive":
      return FileArchive;
    case "audio":
      return FileAudio;
    case "code":
      return FileCode2;
    case "image":
      return FileImage;
    case "video":
      return FileVideo;
    case "markdown":
    case "pdf":
      return FileText;
    default:
      return File;
  }
}

export function FileTypeIcon({
  fileName,
  ...props
}: IconProps & { fileName: string }) {
  const Icon = fileIconForType(fileTypeForName(fileName));
  return <Icon {...iconProps} {...props} />;
}
