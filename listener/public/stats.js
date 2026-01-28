/**
 * Statistics View Module
 *
 * Displays aggregate statistics and percentile charts.
 * Uses Chart.js for visualization.
 */

let currentChart = null;
let chartLibraryLoaded = false;

/**
 * Load Chart.js library dynamically
 */
async function loadChartJs() {
  if (chartLibraryLoaded) return;

  return new Promise((resolve, reject) => {
    if (window.Chart) {
      chartLibraryLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    script.onload = () => {
      chartLibraryLoaded = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * Show statistics view
 *
 * @param {HTMLElement} container - Container element
 * @param {string|null} project - Optional project filter
 */
export async function showStats(container, project = null) {
  // Cleanup previous chart
  hideStats();

  // Show loading
  container.innerHTML = `
    <div class="stats-loading" aria-busy="true">
      Loading statistics...
    </div>
  `;

  try {
    // Load Chart.js
    await loadChartJs();

    // Fetch projects for filter
    const projectsResponse = await fetch('/api/projects');
    const projectsData = await projectsResponse.json();
    const projects = projectsData.projects || [];

    // Fetch statistics
    const statsUrl = project ? `/api/stats?project=${encodeURIComponent(project)}` : '/api/stats';
    const statsResponse = await fetch(statsUrl);

    if (!statsResponse.ok) {
      throw new Error('Failed to load statistics');
    }

    const stats = await statsResponse.json();

    // Render stats view
    container.innerHTML = `
      <div class="stats-view">
        <div class="stats-header">
          <h3>Statistics${project ? `: ${escapeHtml(project)}` : ' (All Projects)'}</h3>
          <div class="stats-project-filter">
            <label for="stats-project">Project:</label>
            <select id="stats-project">
              <option value="">All Projects</option>
              ${projects.map(p => `<option value="${escapeHtml(p)}" ${p === project ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stats-card">
            <span class="stats-value">${formatNumber(stats.total_records)}</span>
            <span class="stats-label">Total Records</span>
          </div>
          <div class="stats-card">
            <span class="stats-value">${formatNumber(stats.total_php_requests)}</span>
            <span class="stats-label">PHP Requests</span>
          </div>
          <div class="stats-card">
            <span class="stats-value">${formatNumber(stats.total_postgres_records)}</span>
            <span class="stats-label">Postgres Records</span>
          </div>
          <div class="stats-card">
            <span class="stats-value">${stats.avg_duration ? stats.avg_duration.toFixed(0) + 'ms' : '-'}</span>
            <span class="stats-label">Avg Duration</span>
          </div>
        </div>

        <div class="stats-dates">
          <p>Data range: ${formatDate(stats.oldest_timestamp)} to ${formatDate(stats.newest_timestamp)}</p>
        </div>

        <!-- URL Stats Section -->
        <div class="stats-url-section">
          <h4>URL Statistics</h4>
          <div class="stats-url-form">
            <input type="text" id="stats-url" placeholder="Enter URL pattern (e.g., /api/users)" value="">
            <button id="stats-url-btn" class="secondary">Analyze URL</button>
          </div>
          <div id="stats-url-results"></div>
        </div>

        <!-- Chart Section -->
        <div class="stats-chart-section">
          <h4>Records by Source</h4>
          <div class="chart-container">
            <canvas id="stats-chart"></canvas>
          </div>
        </div>
      </div>
    `;

    // Add event listeners
    const projectSelect = container.querySelector('#stats-project');
    projectSelect.addEventListener('change', (e) => {
      showStats(container, e.target.value || null);
    });

    const urlBtn = container.querySelector('#stats-url-btn');
    const urlInput = container.querySelector('#stats-url');
    urlBtn.addEventListener('click', () => analyzeUrl(project, urlInput.value, container.querySelector('#stats-url-results')));
    urlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        analyzeUrl(project, urlInput.value, container.querySelector('#stats-url-results'));
      }
    });

    // Render chart
    renderSourceChart(stats);

  } catch (error) {
    console.error('[Stats] Failed to load statistics:', error);
    container.innerHTML = `
      <div class="stats-error">
        <p>Failed to load statistics: ${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

/**
 * Analyze URL statistics
 */
async function analyzeUrl(project, url, container) {
  if (!url) {
    container.innerHTML = '<p class="stats-hint">Enter a URL pattern to see detailed statistics</p>';
    return;
  }

  container.innerHTML = '<div aria-busy="true">Analyzing...</div>';

  try {
    const params = new URLSearchParams();
    if (project) params.set('project', project);
    params.set('url', url);

    const response = await fetch(`/api/stats?${params.toString()}`);

    if (!response.ok) {
      throw new Error('Failed to analyze URL');
    }

    const stats = await response.json();

    if (!stats.count || stats.count === 0) {
      container.innerHTML = `<p class="stats-hint">No data found for URL pattern: ${escapeHtml(url)}</p>`;
      return;
    }

    container.innerHTML = `
      <div class="url-stats-results">
        <h5>URL: ${escapeHtml(stats.url || url)}</h5>
        <div class="url-stats-grid">
          <div class="url-stats-item">
            <span class="value">${formatNumber(stats.count)}</span>
            <span class="label">Requests</span>
          </div>
          <div class="url-stats-item">
            <span class="value">${stats.avg_duration?.toFixed(0) || '-'}ms</span>
            <span class="label">Average</span>
          </div>
          <div class="url-stats-item">
            <span class="value">${stats.min_duration?.toFixed(0) || '-'}ms</span>
            <span class="label">Min</span>
          </div>
          <div class="url-stats-item">
            <span class="value">${stats.max_duration?.toFixed(0) || '-'}ms</span>
            <span class="label">Max</span>
          </div>
        </div>
        ${stats.p50 !== null ? `
        <div class="url-stats-percentiles">
          <h6>Duration Percentiles</h6>
          <div class="percentile-chart-container">
            <canvas id="percentile-chart"></canvas>
          </div>
        </div>
        ` : '<p class="stats-hint">Percentile data requires more samples</p>'}
      </div>
    `;

    // Render percentile chart if data available
    if (stats.p50 !== null) {
      renderPercentileChart(stats);
    }

  } catch (error) {
    console.error('[Stats] URL analysis failed:', error);
    container.innerHTML = `<p class="stats-error">Analysis failed: ${escapeHtml(error.message)}</p>`;
  }
}

/**
 * Render source distribution chart
 */
function renderSourceChart(stats) {
  const canvas = document.getElementById('stats-chart');
  if (!canvas || !window.Chart) return;

  // Destroy existing chart
  if (currentChart) {
    currentChart.destroy();
  }

  const ctx = canvas.getContext('2d');
  currentChart = new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['PHP Requests', 'Postgres Records'],
      datasets: [{
        data: [stats.total_php_requests || 0, stats.total_postgres_records || 0],
        backgroundColor: [
          'rgba(54, 162, 235, 0.7)',
          'rgba(255, 159, 64, 0.7)',
        ],
        borderColor: [
          'rgb(54, 162, 235)',
          'rgb(255, 159, 64)',
        ],
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
        },
      },
    },
  });
}

/**
 * Render percentile bar chart
 */
function renderPercentileChart(stats) {
  const canvas = document.getElementById('percentile-chart');
  if (!canvas || !window.Chart) return;

  const ctx = canvas.getContext('2d');
  new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Min', 'P50', 'Avg', 'P95', 'P99', 'Max'],
      datasets: [{
        label: 'Duration (ms)',
        data: [
          stats.min_duration || 0,
          stats.p50 || 0,
          stats.avg_duration || 0,
          stats.p95 || 0,
          stats.p99 || 0,
          stats.max_duration || 0,
        ],
        backgroundColor: [
          'rgba(75, 192, 192, 0.7)',
          'rgba(54, 162, 235, 0.7)',
          'rgba(153, 102, 255, 0.7)',
          'rgba(255, 206, 86, 0.7)',
          'rgba(255, 159, 64, 0.7)',
          'rgba(255, 99, 132, 0.7)',
        ],
        borderColor: [
          'rgb(75, 192, 192)',
          'rgb(54, 162, 235)',
          'rgb(153, 102, 255)',
          'rgb(255, 206, 86)',
          'rgb(255, 159, 64)',
          'rgb(255, 99, 132)',
        ],
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Duration (ms)',
          },
        },
      },
    },
  });
}

/**
 * Hide statistics view and cleanup
 */
export function hideStats() {
  if (currentChart) {
    currentChart.destroy();
    currentChart = null;
  }
}

// Utility functions

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function formatNumber(num) {
  if (num === null || num === undefined) return '-';
  return num.toLocaleString();
}

function formatDate(timestamp) {
  if (!timestamp) return '-';
  return new Date(timestamp * 1000).toLocaleDateString();
}
