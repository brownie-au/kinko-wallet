// src/sections/dashboard/default/PortfolioBalanceChart.jsx
/* eslint-disable import/no-relative-parent-imports */
import { useMemo, useState } from 'react';
import { Card, ButtonGroup, Button } from 'react-bootstrap';
import Chart from 'react-apexcharts';

// ------------------------------------------------------------------
// Dummy values only (swap with real history later).
// We pair each value with an x:Date so the axis + footer are correct.
// ------------------------------------------------------------------
const MOCK = {
  '7D': [42000, 42350, 42110, 42780, 43120, 43500, 43120],
  '1M': [39600, 40200, 40850, 41520, 42200, 42950, 43120, 43010, 42880, 43120],
  '3M': [36500, 37200, 38900, 40400, 41750, 43300, 43120, 43600, 44400, 43120],
  '1Y': [38500, 39200, 40100, 40800, 41400, 42000, 42500, 43120, 43650, 44200, 44800, 43120],
  YTD: [31800, 33300, 35200, 38100, 40400, 42900, 43120],
  ALL: [12000, 15000, 21000, 27500, 33000, 38500, 43120]
};

const RANGES = ['7D', '1M', '3M', '1Y', 'YTD', 'ALL'];

// Helpers to generate date points for each range
function genDates(range, count) {
  const now = new Date();
  const points = [];

  if (range === '7D') {
    // last 7 days (inclusive today)
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      points.push(d);
    }
  } else if (range === '1M') {
    // last ~30 days, equal steps by day
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      points.push(d);
    }
  } else if (range === '3M') {
    // last ~90 days, step weekly
    const step = Math.max(1, Math.round(90 / count));
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * step);
      points.push(d);
    }
  } else if (range === '1Y') {
    // last 12 months, step monthly
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      points.push(d);
    }
  } else if (range === 'YTD') {
    // from Jan 1 to now, spread across count points
    const start = new Date(now.getFullYear(), 0, 1);
    const span = now.getTime() - start.getTime();
    for (let i = 0; i < count; i++) {
      const t = start.getTime() + Math.round((i / (count - 1)) * span);
      points.push(new Date(t));
    }
  } else {
    // ALL: last ~6 years, yearly steps
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - i);
      points.push(d);
    }
  }
  return points;
}

function fmtShort(d) {
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PortfolioBalanceChart() {
  const [range, setRange] = useState('7D');

  // Build datetime series + footer dates
  const { series, startDate, endDate } = useMemo(() => {
    const vals = MOCK[range] || [];
    const dates = genDates(range, vals.length);
    const s = [
      {
        name: 'Total Balance',
        data: vals.map((y, i) => ({ x: dates[i], y }))
      }
    ];
    return { series: s, startDate: dates[0], endDate: dates[dates.length - 1] };
  }, [range]);

  const options = useMemo(
    () => ({
      chart: {
        type: 'area',
        height: 320,
        toolbar: { show: false },
        zoom: { enabled: false }
      },
      stroke: { curve: 'smooth', width: 2 },
      dataLabels: { enabled: false },
      fill: {
        type: 'gradient',
        gradient: { shadeIntensity: 1, opacityFrom: 0.25, opacityTo: 0.05, stops: [0, 100] }
      },
      grid: { borderColor: 'rgba(255,255,255,0.08)' },
      xaxis: {
        type: 'datetime',
        labels: {
          datetimeUTC: false,
          format: range === '1Y' || range === 'ALL' ? 'MMM yyyy' : 'dd MMM'
        },
        axisTicks: { show: false },
        axisBorder: { show: false }
      },
      yaxis: {
        labels: {
          formatter: (val) => `$${Number(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        }
      },
      tooltip: {
        x: { format: 'dd MMM yyyy' },
        y: {
          formatter: (val) => `$${Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
        }
      }
    }),
    [range]
  );

  return (
    <Card className="h-100">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div className="text-muted">Portfolio Balance</div>
          <ButtonGroup size="sm" aria-label="range">
            {RANGES.map((r) => (
              <Button key={r} variant={r === range ? 'primary' : 'outline-secondary'} onClick={() => setRange(r)}>
                {r}
              </Button>
            ))}
          </ButtonGroup>
        </div>

        <Chart options={options} series={series} height={320} type="area" />

        {/* ---- Date range footer ---- */}
        {startDate && endDate && (
          <div className="d-flex justify-content-between text-muted small mt-2">
            <span>{fmtShort(startDate)}</span>
            <span>{fmtShort(endDate)}</span>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
