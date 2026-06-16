const tracer = require('dd-trace').init();
const StatsD = require('hot-shots');

const dogstatsd = new StatsD({ host: '127.0.0.1', port: 8125 });

function log(level, message, extra = {}) {
  const span = tracer.scope().active();
  const traceId = span ? span.context().toTraceId() : '0';
  const spanId = span ? span.context().toSpanId() : '0';

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    dd: { trace_id: traceId, span_id: spanId, env: process.env.DD_ENV, service: process.env.DD_SERVICE, version: process.env.DD_VERSION },
    ...extra,
  };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

module.exports.hello = async (event) => {
  log('info', 'Request received', { path: event.path });

  // Métrica customizada de negócio via DogStatsD (herda Unified Service Tags automaticamente)
  dogstatsd.increment('business.request.count');

  log('info', 'Processing complete');

  return { statusCode: 200, body: JSON.stringify({ message: 'ok', traceEnabled: true }) };
};
