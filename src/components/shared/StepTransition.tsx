import { ReactNode, useEffect, useState } from 'react';

interface StepTransitionProps {
  children: ReactNode;
  stepKey: number | string;
}

export function StepTransition({ children, stepKey }: StepTransitionProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(false);
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, [stepKey]);

  return (
    <div
      style={{
        transition: 'all 200ms ease-out',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(8px)',
      }}
    >
      {children}
    </div>
  );
}
