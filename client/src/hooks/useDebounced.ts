import * as React from 'react';

/** `value`, once it has stopped changing for `ms` - so a search box queries per pause, not per keystroke. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [settled, setSettled] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
