/**
 * Bitville APM Dashboard Application
 *
 * Vanilla JavaScript dashboard for viewing profiling data.
 * Uses fetch API for data loading, no external dependencies.
 */

// State
let state = {
  currentCursor: null,
  isLoading: false,
  currentFilters: {},
  results: [],
};

// DOM Elements (cached after init)
let elements = {};

/**
 * Initialize dashboard
 */
export function init() {
  // Cache DOM elements
  elements = {
    searchForm: document.getElementById('search-form'),
    projectFilter: document.getElementById('project-filter'),
    urlFilter: document.getElementById('url-filter'),
    durationMin: document.getElementById('duration-min'),
    sourceFilter: document.getElementById('source-filter'),
    dateStart: document.getElementById('date-start'),
    dateEnd: document.getElementById('date-end'),
    loading: document.getElementById('loading'),
    errorMessage: document.getElementById('error-message'),
    resultsInfo: document.getElementById('results-info'),
    resultsBody: document.getElementById('results-body'),
    loadMore: document.getElementById('load-more'),
    detailModal: document.getElementById('detail-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalContent: document.getElementById('modal-content'),
    closeModal: document.getElementById('close-modal'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    statusIndicator: document.getElementById('status-indicator'),
  };

  // Event listeners
  elements.searchForm.addEventListener('submit', handleSearch);
  elements.loadMore.addEventListener('click', loadMoreResults);
  elements.closeModal.addEventListener('click', closeModal);
  elements.modalCloseBtn.addEventListener('click', closeModal);
  elements.detailModal.addEventListener('click', (e) => {
    if (e.target === elements.detailModal) closeModal();
  });

  // Load initial data
  loadProjects();
  performSearch();

  console.log('[Dashboard] Initialized');
}

/**
 * Load project list for filter dropdown
 */
async function loadProjects() {
  try {
    const response = await fetch('/api/projects');
    if (!response.ok) throw new Error('Failed to load projects');

    const data = await response.json();
    const select = elements.projectFilter;

    // Clear existing options (keep "All Projects")
    while (select.options.length > 1) {
      select.remove(1);
    }

    // Add project options
    data.projects.forEach(project => {
      const option = document.createElement('option');
      option.value = project;
      option.textContent = project;
      select.appendChild(option);
    });

    updateStatus('Connected', true);
  } catch (error) {
    console.error('[Dashboard] Failed to load projects:', error);
    updateStatus('Error loading projects', false);
  }
}

/**
 * Handle search form submission
 */
function handleSearch(event) {
  event.preventDefault();
  state.currentCursor = null;
  state.results = [];
  performSearch();
}

/**
 * Perform search with current filters
 */
async function performSearch() {
  if (state.isLoading) return;

  showLoading(true);
  hideError();

  try {
    // Build query parameters
    const params = new URLSearchParams();

    const project = elements.projectFilter.value;
    if (project) params.set('project', project);

    const url = elements.urlFilter.value;
    if (url) params.set('url', url);

    const durationMin = elements.durationMin.value;
    if (durationMin) params.set('duration_min', durationMin);

    const source = elements.sourceFilter.value;
    if (source) params.set('source', source);

    const dateStart = elements.dateStart.value;
    if (dateStart) {
      params.set('timestamp_start', Math.floor(new Date(dateStart).getTime() / 1000));
    }

    const dateEnd = elements.dateEnd.value;
    if (dateEnd) {
      params.set('timestamp_end', Math.floor(new Date(dateEnd).getTime() / 1000));
    }

    if (state.currentCursor) {
      params.set('after', state.currentCursor);
    }

    params.set('limit', '50');

    // Fetch results
    const response = await fetch(`/api/search?${params.toString()}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Search failed');
    }

    const data = await response.json();

    // Update state
    state.results = state.currentCursor ? [...state.results, ...data.items] : data.items;
    state.currentCursor = data.cursor;
    state.currentFilters = Object.fromEntries(params);

    // Render results
    renderResults(state.currentCursor === null);
    elements.loadMore.hidden = !data.hasMore;

    updateStatus('Connected', true);
  } catch (error) {
    console.error('[Dashboard] Search failed:', error);
    showError(error.message);
    updateStatus('Error', false);
  } finally {
    showLoading(false);
  }
}

/**
 * Load more results (pagination)
 */
function loadMoreResults() {
  performSearch();
}

/**
 * Render results to table
 */
function renderResults(clearExisting = true) {
  const tbody = elements.resultsBody;

  if (clearExisting) {
    tbody.innerHTML = '';
  }

  if (state.results.length === 0) {
    elements.resultsInfo.textContent = 'No results found';
    return;
  }

  elements.resultsInfo.textContent = `Showing ${state.results.length} results`;

  // Only render new items when appending
  const startIndex = clearExisting ? 0 : state.results.length - 50;
  const items = clearExisting ? state.results : state.results.slice(startIndex);

  items.forEach(item => {
    const row = document.createElement('tr');
    row.dataset.id = item.id;
    row.dataset.correlationId = item.correlation_id;

    // Format timestamp
    const date = new Date(item.timestamp * 1000);
    const formattedDate = date.toLocaleString();

    // Format duration with color coding
    const duration = item.duration_ms;
    let durationClass = 'duration-fast';
    if (duration > 1000) durationClass = 'duration-slow';
    else if (duration > 500) durationClass = 'duration-medium';

    // Extract URL from payload if virtual column not available
    let url = item.url || '';
    if (!url && item.payload) {
      try {
        const payload = JSON.parse(item.payload);
        url = payload.request?.uri || payload.url || '-';
      } catch (e) {
        url = '-';
      }
    }

    row.innerHTML = `
      <td>${formattedDate}</td>
      <td>${escapeHtml(item.project)}</td>
      <td title="${escapeHtml(url)}">${truncate(url, 40)}</td>
      <td class="${durationClass}">${duration ? duration.toFixed(0) + 'ms' : '-'}</td>
      <td>${item.source}</td>
      <td><button class="secondary outline" data-action="view">View</button></td>
    `;

    // Click handler for row
    row.addEventListener('click', (e) => {
      if (e.target.dataset.action === 'view' || e.target.tagName !== 'BUTTON') {
        viewRequestDetails(item);
      }
    });

    tbody.appendChild(row);
  });
}

/**
 * View request details in modal
 */
function viewRequestDetails(item) {
  elements.modalTitle.textContent = `Request: ${item.correlation_id.slice(0, 8)}...`;

  let payload = {};
  try {
    payload = JSON.parse(item.payload);
  } catch (e) {
    payload = { error: 'Failed to parse payload', raw: item.payload };
  }

  elements.modalContent.innerHTML = `
    <h4>Overview</h4>
    <dl>
      <dt>Correlation ID</dt>
      <dd><code>${item.correlation_id}</code></dd>
      <dt>Project</dt>
      <dd>${escapeHtml(item.project)}</dd>
      <dt>Source</dt>
      <dd>${item.source}</dd>
      <dt>Duration</dt>
      <dd>${item.duration_ms ? item.duration_ms.toFixed(0) + 'ms' : '-'}</dd>
      <dt>Timestamp</dt>
      <dd>${new Date(item.timestamp * 1000).toLocaleString()}</dd>
    </dl>

    <h4>Payload</h4>
    <pre><code>${escapeHtml(JSON.stringify(payload, null, 2))}</code></pre>
  `;

  elements.detailModal.showModal();
}

/**
 * Close detail modal
 */
function closeModal() {
  elements.detailModal.close();
}

// Utility functions

function showLoading(show) {
  state.isLoading = show;
  elements.loading.hidden = !show;
}

function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorMessage.hidden = false;
}

function hideError() {
  elements.errorMessage.hidden = true;
}

function updateStatus(text, connected) {
  elements.statusIndicator.textContent = text;
  elements.statusIndicator.className = connected ? 'status-connected' : 'status-error';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text || '';
  return text.slice(0, maxLength) + '...';
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
