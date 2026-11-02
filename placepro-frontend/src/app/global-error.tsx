"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logger.error("ui.unhandled_error", error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main>
          <h1>Something went wrong</h1>
          <p>Please try again. If the problem continues, contact support.</p>
          <button type="button" onClick={reset}>Try again</button>
        </main>
      </body>
    </html>
  );
}
