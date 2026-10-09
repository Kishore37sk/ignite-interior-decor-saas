import * as React from 'react';
export type IconName =
  | "IconArchiveTray"
  | "IconArrowUUpLeft"
  | "IconArrowUUpRight"
  | "IconCalendarBlank"
  | "IconCaretDown"
  | "IconCaretLeft"
  | "IconCaretRight"
  | "IconFadersHorizontal"
  | "IconFunnel"
  | "IconListNumbers"
  | "IconMagnifyingGlass"
  | "IconPaperclip"
  | "IconSmileySticker"
  | "IconTextAa"
  | "IconTextAlignLeft"
  | "IconTextB"
  | "IconTextItalic"
  | "IconTextUnderline"
  | "IconTrash"
  | "IconTruck"
  | "IconX";
export interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number | string;
}
export declare const Icon: React.FC<IconProps>;
export default Icon;
