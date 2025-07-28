import { useMemo } from 'react';

// third-party
import ReactApexChart from 'react-apexcharts';

function generateBubbleData(baseval, count, yrange) {
  const series = [];
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * (750 - 1 + 1)) + 1;
    const y = Math.floor(Math.random() * (yrange.max - yrange.min + 1)) + yrange.min;
    const z = Math.floor(Math.random() * (75 - 15 + 1)) + 15;
    series.push([x, y, z]);
    baseval += 86400000;
  }
  return series;
}

// chart-options
const options = {
  dataLabels: {
    enabled: false
  },
  colors: ['#04a9f5', '#1de9b6', '#f4c22b', '#f44236'],
  fill: {
    opacity: 0.8
  },
  xaxis: {
    tickAmount: 12,
    type: 'category'
  },
  yaxis: {
    max: 70
  }
};

// ==============================|| APEX CHART - BUBBLE CHART ||============================== //

export default function BubbleChart() {
  const series = useMemo(
    () => [
      {
        name: 'Bubble1',
        data: generateBubbleData(new Date('11 Feb 2017 GMT').getTime(), 20, { min: 10, max: 60 })
      },
      {
        name: 'Bubble2',
        data: generateBubbleData(new Date('11 Feb 2017 GMT').getTime(), 20, { min: 10, max: 60 })
      },
      {
        name: 'Bubble3',
        data: generateBubbleData(new Date('11 Feb 2017 GMT').getTime(), 20, { min: 10, max: 60 })
      },
      {
        name: 'Bubble4',
        data: generateBubbleData(new Date('11 Feb 2017 GMT').getTime(), 20, { min: 10, max: 60 })
      }
    ],
    []
  );

  return <ReactApexChart options={options} series={series} type="bubble" height={350} />;
}
