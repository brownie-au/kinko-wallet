import PropTypes from 'prop-types';
// react-bootstrap
import Stack from 'react-bootstrap/Stack';

// third-party
import ReactApexChart from 'react-apexcharts';

// project-imports
import DropDown from 'sections/dashboard/finance/DropDown';
import MainCard from 'components/MainCard';

// ==============================|| TRANSACTIONS CHART ||============================== //

export default function TransactionsChart({ title, dateRange, amount, description, chartColor = '', series = [] }) {
  const chartOptions = {
    chart: {
      sparkline: {
        enabled: true
      }
    },
    colors: [chartColor],
    dataLabels: {
      enabled: false
    },

    stroke: {
      curve: 'straight',
      lineCap: 'round',
      width: 3
    },
    series,
    yaxis: {
      min: 0,
      max: 30,
      label: {
        show: false
      }
    },

    tooltip: {
      theme: 'light',
      fixed: {
        enabled: false
      },
      x: {
        show: false
      },
      y: {
        title: {
          formatter: function () {
            return '';
          }
        }
      },
      marker: {
        show: false
      }
    }
  };

  return (
    <MainCard>
      <Stack direction="horizontal" className="align-items-center justify-content-between mb-3">
        <div>
          <h6 className="mb-0">{title}</h6>
          <p className="mb-0 text-muted">{dateRange}</p>
        </div>
        <DropDown className="avatar-xs" />
      </Stack>

      <ReactApexChart options={chartOptions} series={series} type="line" height={60} />

      <Stack direction="horizontal" gap={2} className=" align-items-center justify-content-between mt-3">
        <h4 className="mb-0">
          <small className="text-muted">$</small>
          {amount}
        </h4>
        <p className="mb-0 text-muted text-sm">{description}</p>
      </Stack>
    </MainCard>
  );
}

TransactionsChart.propTypes = {
  title: PropTypes.string,
  dateRange: PropTypes.string,
  amount: PropTypes.string,
  description: PropTypes.string,
  chartColor: PropTypes.string,
  series: PropTypes.object
};
