// logger.js
// Small timestamped logger used across the app so every request, DB call
// and background task is traceable with a precise time.

function timestamp() {
  return new Date().toISOString();
}

function log(...args) {
  console.log(`[${timestamp()}]`, ...args);
}

function logError(...args) {
  console.error(`[${timestamp()}]`, ...args);
}

// Logs a DB query right before it is sent (request) and returns a function
// to call with the result once it comes back (response), including timing.
function logDbQuery(label, sql, params) {
  const startedAt = Date.now();
  log(`🗄️  [DB REQUEST] ${label} | sql="${sql.replace(/\s+/g, " ").trim()}" | params=${JSON.stringify(params)}`);

  return function logDbResult(result, error) {
    const durationMs = Date.now() - startedAt;
    if (error) {
      logError(`🗄️  [DB ERROR]    ${label} | duration=${durationMs}ms | error=${error.message}`);
      return;
    }
    const rowCount = result && (result.rowCount ?? (result.rows ? result.rows.length : undefined));
    log(`🗄️  [DB RESPONSE] ${label} | duration=${durationMs}ms | rowCount=${rowCount}`);
  };
}

function logTask(label, extra) {
  log(`⚙️  [TASK] ${label}${extra !== undefined ? " | " + JSON.stringify(extra) : ""}`);
}

module.exports = { timestamp, log, logError, logDbQuery, logTask };
