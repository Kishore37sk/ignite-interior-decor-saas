import * as React from 'react';
export interface CheckboxProps {
  className?: string;
  style?: React.CSSProperties;
  state?: "default" | "checked" | "filled";
  size?: "default" | "big" | "md";
}
export declare const Checkbox: React.FC<CheckboxProps>;
export default Checkbox;
