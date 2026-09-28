declare module '@sohumsuthar/liquid-glass/components/LiquidGlass.jsx' {
  import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

  interface LiquidGlassProps extends HTMLAttributes<HTMLDivElement> {
    macro?: boolean;
    variant?: 'clear' | 'regular';
    dimmed?: boolean;
    interactive?: boolean;
    lens?: boolean;
    lensOptions?: { bezel?: number; refraction?: number; dispersion?: number; radius?: number };
    mobileFlat?: boolean;
    contentClassName?: string;
    contentStyle?: CSSProperties;
    children?: ReactNode;
  }

  export default function LiquidGlass(props: LiquidGlassProps): React.JSX.Element;
}
