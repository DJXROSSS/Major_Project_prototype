const { logger } = require("./logger");

function createImportPerformance(kind, requestId) {
  const startedAt = process.hrtime.bigint();
  const stages = {};

  async function measure(name, operation) {
    const stageStartedAt = process.hrtime.bigint();
    try {
      return await operation();
    } finally {
      stages[name] = Math.round(Number(process.hrtime.bigint() - stageStartedAt) / 1e6);
    }
  }

  function log(extra = {}) {
    logger.info("import.performance", {
      requestId,
      kind,
      totalMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6),
      stages,
      ...extra,
    });
  }

  return { measure, log };
}

module.exports = { createImportPerformance };
