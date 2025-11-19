export const charts = {};

export function initRssiChart(device) {
  const canvas = document.getElementById(`rssiChart${device}`);
  if (!canvas || typeof Chart === 'undefined') return;
  const ctx = canvas.getContext('2d');
  charts[device] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: `Gerät ${device} (ISSI __ISSI${device}__)`,
          data: [],
          fill: false,
          borderColor: device === 1 ? 'blue' : 'red',
          tension: 0.1
        }
      ]
    },
    options: {
      animation: false,
      scales: {
        y: {
          beginAtZero: false
        }
      }
    }
  });
}

export function addRssi(value, device = 1) {
  const chart = charts[device];
  if (!chart) return;
  const time = new Date().toLocaleTimeString();
  chart.data.labels.push(time);
  chart.data.datasets[0].data.push(value);
  if (chart.data.labels.length > 50) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update();
}
