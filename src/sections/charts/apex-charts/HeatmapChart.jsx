import { useMemo } from 'react';

// third-party
import ReactApexChart from 'react-apexcharts';

function generateDatasehratheat(count, yrange) {
  const series = [];
  for (let i = 0; i < count; i++) {
    const x = `w${i + 1}`;
    const y = Math.floor(Math.random() * (yrange.max - yrange.min + 1)) + yrange.min;
    series.push({ x, y });
  }
  return series;
}

const options = {
  dataLabels: {
    enabled: false
  },
  colors: ['#04a9f5']
};

// ==============================|| APEX CHART - HEATMAP CHART ||============================== //

export default function HeatMapChart() {
  const series = useMemo(
    () => [
      {
        name: 'Metric1',
        data: generateDatasehratheat(12, { min: 0, max: 90 })
      },
      {
        name: 'Metric2',
        data: generateDatasehratheat(12, { min: 0, max: 90 })
      },
      {
        name: 'Metric3',
        data: generateDatasehratheat(12, { min: 0, max: 90 })
      },
      {
        name: 'Metric4',
        data: generateDatasehratheat(12, { min: 0, max: 90 })
      },
      {
        name: 'Metric5',
        data: generateDatasehratheat(12, { min: 0, max: 90 })
      },
      {
        name: 'Metric6',
        data: generateDatasehratheat(12, { min: 0, max: 90 })
      },
      {
        name: 'Metric7',
        data: generateDatasehratheat(12, { min: 0, max: 90 })
      },
      {
        name: 'Metric8',
        data: generateDatasehratheat(12, { min: 0, max: 90 })
      },
      {
        name: 'Metric9',
        data: generateDatasehratheat(12, { min: 0, max: 90 })
      }
    ],
    []
  );

  return <ReactApexChart options={options} series={series} type="heatmap" height={350} />;
}
