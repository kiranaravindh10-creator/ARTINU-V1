import { useContentSSE } from '@/hooks/useContentSSE';

export function ContentSSEProvider() {
  useContentSSE();
  return null;
}