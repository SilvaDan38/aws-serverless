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

module.exports.handler = async (event) => {
  log('info', 'processOrder started', { orderId: event.orderId });
  dogstatsd.increment('step_function.process_order.invocations');

  const result = { ...event, status: 'processed', processedAt: new Date().toISOString() };

  log('info', 'processOrder completed', { orderId: event.orderId });
  return result;
};
