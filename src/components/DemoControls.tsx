'use client';

import { useEffect, useState } from 'react';

/** Lets a reviewer see the API-failure state: sets a cookie the mock API reads, then reloads. */
export function DemoControls() {
  const [failing, setFailing] = useState(false);
  useEffect(() => setFailing(/(?:^|;\s*)mock-fail=1/.test(document.cookie)), []);
  return (
    <label className="demo">
      <input
        type="checkbox" checked={failing}
        onChange={(e) => {
          document.cookie = `mock-fail=${e.target.checked ? 1 : 0}; path=/; max-age=${e.target.checked ? 3600 : 0}`;
          setFailing(e.target.checked);
          location.reload();
        }}
      />
      Simulate API failure
    </label>
  );
}
