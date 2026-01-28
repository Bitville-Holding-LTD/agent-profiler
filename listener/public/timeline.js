/**
 * Timeline Visualization Module
 *
 * Uses vis-timeline to render request traces as waterfall diagrams.
 * Shows PHP request as main span with SQL queries as child spans.
 */

// Import vis-timeline (will be bundled by Bun)
// Note: vis-timeline needs to be loaded from CDN or bundled specially
// For simplicity, we'll use the standalone version via dynamic import

let Timeline = null;
let currentTimeline = null;

/**
 * Load vis-timeline library dynamically
 */
async function loadVisTimeline() {
  if (Timeline) return Timeline;

  // Load from CDN (vis-timeline standalone includes all dependencies)
  return new Promise((resolve, reject) => {
    if (window.vis && window.vis.Timeline) {
      Timeline = window.vis.Timeline;
      resolve(Timeline);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/vis-timeline@7.7.3/standalone/umd/vis-timeline-graph2d.min.js';
    script.onload = () => {
      Timeline = window.vis.Timeline;
      resolve(Timeline);
    };
    script.onerror = reject;
    document.head.appendChild(script);

    // Also load CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/vis-timeline@7.7.3/styles/vis-timeline-graph2d.min.css';
    document.head.appendChild(link);
  });
}

/**
 * Render timeline visualization for a trace
 *
 * @param {HTMLElement} container - DOM element to render into
 * @param {Object} traceData - Trace data from /api/correlation/:id
 * @returns {Function} Cleanup function to destroy timeline
 */
export async function renderTimeline(container, traceData) {
  await loadVisTimeline();

  // Destroy existing timeline if any
  destroyTimeline();

  if (!traceData || !traceData.trace) {
    container.innerHTML = '<p>No trace data available</p>';
    return () => {};
  }

  const { php_request, sql_queries } = traceData.trace;

  // Build timeline items
  const items = [];
  const groups = [
    { id: 'php', content: 'PHP Request', className: 'timeline-group-php' },
    { id: 'sql', content: 'SQL Queries', className: 'timeline-group-sql' },
  ];

  // PHP request span
  if (php_request) {
    const payload = typeof php_request.payload === 'string'
      ? JSON.parse(php_request.payload)
      : php_request.payload;

    const startTime = php_request.timestamp * 1000;
    const duration = php_request.duration_ms || payload.timing?.duration_ms || 0;
    const endTime = startTime + duration;

    items.push({
      id: `php-${php_request.id}`,
      group: 'php',
      content: truncateUrl(payload.request?.uri || 'PHP Request'),
      start: new Date(startTime),
      end: new Date(endTime),
      className: 'timeline-item-php',
      title: `${payload.request?.method || 'GET'} ${payload.request?.uri || ''}\nDuration: ${duration.toFixed(0)}ms`,
    });

    // Add SQL queries from PHP payload if available
    if (payload.sql && payload.sql.queries) {
      let sqlOffset = 0;
      payload.sql.queries.slice(0, 50).forEach((query, idx) => {
        const queryStart = startTime + sqlOffset;
        const queryEnd = queryStart + (query.duration_ms || 1);
        sqlOffset += query.duration_ms || 1;

        items.push({
          id: `sql-inline-${idx}`,
          group: 'sql',
          content: truncateQuery(query.query),
          start: new Date(queryStart),
          end: new Date(queryEnd),
          className: getDurationClass(query.duration_ms),
          title: `${query.query}\nDuration: ${(query.duration_ms || 0).toFixed(2)}ms`,
        });
      });
    }
  }

  // SQL queries from postgres_agent (if any)
  if (sql_queries && sql_queries.length > 0) {
    sql_queries.slice(0, 50).forEach((record, idx) => {
      const payload = typeof record.payload === 'string'
        ? JSON.parse(record.payload)
        : record.payload;

      const startTime = record.timestamp * 1000;
      const duration = payload.duration_ms || payload.data?.duration_ms || 1;

      items.push({
        id: `pg-${record.id}`,
        group: 'sql',
        content: truncateQuery(payload.query || payload.data?.query || 'SQL Query'),
        start: new Date(startTime),
        end: new Date(startTime + duration),
        className: getDurationClass(duration),
        title: `${payload.query || payload.data?.query || 'Query'}\nDuration: ${duration.toFixed(2)}ms`,
      });
    });
  }

  if (items.length === 0) {
    container.innerHTML = '<p>No timeline data available</p>';
    return () => {};
  }

  // Calculate time range
  const times = items.flatMap(i => [i.start.getTime(), i.end.getTime()]);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const padding = (maxTime - minTime) * 0.1 || 100;

  // Timeline options
  const options = {
    stack: false,
    groupOrder: 'id',
    orientation: { axis: 'top', item: 'top' },
    margin: { item: { horizontal: 0, vertical: 5 } },
    min: new Date(minTime - padding),
    max: new Date(maxTime + padding),
    zoomMin: 1,  // 1ms minimum zoom
    zoomMax: 60000,  // 1 minute maximum
    tooltip: {
      followMouse: true,
      overflowMethod: 'cap',
    },
    format: {
      minorLabels: {
        millisecond: 'SSS[ms]',
        second: 's[s]',
        minute: 'HH:mm',
      },
      majorLabels: {
        millisecond: 'HH:mm:ss',
        second: 'HH:mm',
        minute: 'ddd D MMMM',
      },
    },
  };

  // Create timeline
  currentTimeline = new Timeline(container, items, groups, options);

  // Fit to show all items
  currentTimeline.fit();

  // Return cleanup function
  return () => destroyTimeline();
}

/**
 * Destroy current timeline instance
 */
export function destroyTimeline() {
  if (currentTimeline) {
    currentTimeline.destroy();
    currentTimeline = null;
  }
}

// Helper functions

function truncateUrl(url) {
  if (!url || url.length <= 40) return url || '';
  return url.slice(0, 37) + '...';
}

function truncateQuery(query) {
  if (!query) return 'Query';
  // Remove extra whitespace
  query = query.replace(/\s+/g, ' ').trim();
  if (query.length <= 30) return query;
  return query.slice(0, 27) + '...';
}

function getDurationClass(duration) {
  if (duration > 100) return 'timeline-item-slow';
  if (duration > 20) return 'timeline-item-medium';
  return 'timeline-item-fast';
}
