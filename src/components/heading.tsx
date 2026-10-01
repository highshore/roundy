import { Children, cloneElement, isValidElement, type ComponentPropsWithRef, type ReactNode } from 'react';
import { headingText } from '@/lib/heading';

function formatChildren(children: ReactNode): ReactNode {
  return Children.map(children, child => {
    if (typeof child === 'string') return headingText(child);
    if (isValidElement<{ children?: ReactNode }>(child) && typeof child.type === 'string' && child.props.children !== undefined) {
      return cloneElement(child, {}, formatChildren(child.props.children));
    }
    return child;
  });
}

export function Heading({ level, children, ...props }: ComponentPropsWithRef<'h1'> & { level: 1 | 2 | 3 | 4 | 5 | 6 }) {
  const Tag = `h${level}` as 'h1';
  return <Tag {...props}>{formatChildren(children)}</Tag>;
}
