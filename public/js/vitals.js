/*
 * vitals.js -- Overview stat cards, Health tab's big "digital" readouts
 * with plain-English comments, and the Chart.js 24h/7d trend graph.
 * Thresholds mirrored from server/services/thresholds.js for the
 * comment text only (the server is the source of truth for actually
 * firing alerts).
 */
const T = {
  TEMP_HIGH_C: 38.0,
  TEMP_LOW_C: 20.0,
  SPO2_LOW_PCT: 90,
  HR_LOW_BPM: 60,
  HR_HIGH_BPM: 140,
};

let vitalsChart;
let currentRange = '24h';

function commentFor(kind, value) {
  if (value === null || value === undefined || Number.isNaN(value) || value <= 0) {
    return { text: 'Waiting for reading...', alert: false };
  }
  if (kind === 'temp') {
    if (value > T.TEMP_HIGH_C) return { text: 'High -- fever alert active', alert: true };
    if (value < T.TEMP_LOW_C) return { text: 'Low -- cold alert active', alert: true };
    return { text: 'Within normal range', alert: false };
  }
  if (kind === 'hr') {
    if (value > T.HR_HIGH_BPM) return { text: 'Higher than usual (display only)', alert: false };
    if (value < T.HR_LOW_BPM) return { text: 'Lower than usual (display only)', alert: false };
    return { text: 'Within normal range', alert: false };
  }
  if (kind === 'spo2') {
    if (value < T.SPO2_LOW_PCT) return { text: 'Lower than usual (display only)', alert: false };
    return { text: 'Within normal range', alert: false };
  }
  return { text: '', alert: false };
}

function updateVitalsUI(detail) {
  if (detail.childId !== AppState.currentChildId) return;
  const v = detail.vitals || {};
  const b = detail.battery || {};

  const hr = v.heartRate || 0;
  const spo2 = v.spo2 || 0;
  const temp = (typeof v.temperatureC === 'number' && v.temperatureC > -50) ? v.temperatureC : null;

  document.getElementById('ovHeartRate').textContent = hr || '--';
  document.getElementById('ovSpo2').textContent = spo2 || '--';
  document.getElementById('ovTemp').textContent = temp !== null ? temp.toFixed(1) : '--';
  document.getElementById('ovBattery').textContent = (b.percent ?? '--') + (b.percent !== undefined ? '%' : '');

  setDigital('hHeartRate', hr, 'bpm', 'hHeartComment', commentFor('hr', hr));
  setDigital('hSpo2', spo2, '%', 'hSpo2Comment', commentFor('spo2', spo2));
  setDigital('hTemp', temp, '°C', 'hTempComment', commentFor('temp', temp), true);
}

function setDigital(valueId, value, unit, commentId, comment, isFloat) {
  const valEl = document.getElementById(valueId);
  const commentEl = document.getElementById(commentId);
  const card = valEl.closest('.digital-card');
  valEl.innerHTML = `${value !== null && value !== undefined && value !== 0 ? (isFloat ? value.toFixed(1) : value) : '--'} <span class="digital-unit">${unit}</span>`;
  commentEl.textContent = comment.text;
  card.classList.toggle('state-alert', comment.alert);
}

async function loadChart(childId, range) {
  const rows = await Api.get(`/api/history/vitals/${childId}?range=${range}`);
  if (!rows) return;

  const labels = rows.map(r => new Date(r.timestamp + 'Z').toLocaleString());
  const hrData = rows.map(r => r.heart_rate);
  const spo2Data = rows.map(r => r.spo2);
  const tempData = rows.map(r => r.temperature);

  const ctx = document.getElementById('vitalsChart');
  if (vitalsChart) vitalsChart.destroy();
  vitalsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Heart Rate (bpm)', data: hrData, borderColor: '#ec6a9c', tension: 0.3, yAxisID: 'y' },
        { label: 'SpO2 (%)', data: spo2Data, borderColor: '#8a6fd1', tension: 0.3, yAxisID: 'y' },
        { label: 'Temperature (°C)', data: tempData, borderColor: '#f0575a', tension: 0.3, yAxisID: 'y1' },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { position: 'left', title: { display: true, text: 'bpm / %' } },
        y1: { position: 'right', title: { display: true, text: '°C' }, grid: { drawOnChartArea: false } },
        x: { ticks: { maxTicksLimit: 8 } },
      },
    },
  });
}

document.querySelectorAll('[data-range]').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentRange = btn.getAttribute('data-range');
    if (AppState.currentChildId) await loadChart(AppState.currentChildId, currentRange);
  });
});

document.addEventListener('telemetry:update', (e) => updateVitalsUI(e.detail));
document.addEventListener('child:switched', () => {
  if (AppState.currentChildId) loadChart(AppState.currentChildId, currentRange);
});
document.addEventListener('children:loaded', () => {
  if (AppState.currentChildId) loadChart(AppState.currentChildId, currentRange);
});
