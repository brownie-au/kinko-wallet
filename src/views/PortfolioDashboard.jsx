import React, { useState, useEffect } from 'react';
import { Card, ButtonGroup, Button, Row, Col } from 'react-bootstrap';
import CountUp from 'react-countup';
import Chart from 'react-apexcharts';

// Mock random data generator
const generateRandomData = () =>
  Array.from({ length: 30 }, (_, i) => ({
    x: `Day ${i + 1}`,
    y: Math.floor(Math.random() * 4000) + 1000
  }));

export default function PortfolioDashboard() {
  const [selectedChain, setSelectedChain] = useState('All');
  const [walletTotal, setWalletTotal] = useState(73742.37);
  const [stakingTotal] = useState(2500);
  const [liquidityTotal] = useState(1471);
  const [growthData, setGrowthData] = useState(generateRandomData());
  const [fgIndex, setFgIndex] = useState(50);
  const [plValue, setPlValue] = useState(50);

  useEffect(() => {
    // Regenerate mock data when chain filter changes
    setGrowthData(generateRandomData());
    setFgIndex(Math.floor(Math.random() * 100));
    setPlValue(Math.floor(Math.random() * 100));

    // Mock wallet total based on chain
    switch (selectedChain) {
      case 'Ethereum':
        setWalletTotal(69771.37);
        break;
      case 'PulseChain':
        setWalletTotal(38751.12);
        break;
      case 'Binance':
        setWalletTotal(15221.5);
        break;
      case 'Polygon':
        setWalletTotal(6471.0);
        break;
      default:
        setWalletTotal(73742.37);
    }
  }, [selectedChain]);

  // === ApexCharts Options ===
  const growthOptions = {
    chart: { type: 'area', toolbar: { show: false } },
    xaxis: { type: 'category', labels: { show: true } },
    stroke: { curve: 'smooth', width: 2 },
    fill: {
      type: 'gradient',
      gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.1 }
    },
    dataLabels: { enabled: true }
  };

  const distributionOptions = {
    labels: ['Ethereum', 'PulseChain', 'Binance', 'Polygon'],
    legend: { position: 'bottom' }
  };
  const distributionSeries = [30, 25, 25, 20];

  const donutOptions = (label) => ({
    labels: [label],
    plotOptions: {
      pie: {
        donut: {
          labels: {
            show: true,
            total: {
              show: true,
              label: label,
              formatter: () => `${label} ${label === 'Fear & Greed Index' ? fgIndex : plValue}%`
            }
          }
        }
      }
    },
    legend: { show: false }
  });

  return (
    <div>
      {/* === Total Value === */}
      <div style={{ textAlign: 'center', fontSize: '2rem', fontWeight: 'bold', marginBottom: '20px' }}>
        <CountUp start={0} end={walletTotal + stakingTotal + liquidityTotal} duration={1.2} separator="," prefix="$" decimals={2} />
      </div>

      {/* === Top 3 Cards === */}
      <Row className="mb-4 text-center">
        <Col xs={12} md={4} style={{ minWidth: '300px' }}>
          <Card className="p-3">
            <h6>Wallets</h6>
            <h4>
              <CountUp start={0} end={walletTotal} duration={1.2} separator="," prefix="$" decimals={2} />
            </h4>
          </Card>
        </Col>
        <Col xs={12} md={4} style={{ minWidth: '300px' }}>
          <Card className="p-3">
            <h6>Staking</h6>
            <h4>${stakingTotal.toLocaleString()}</h4>
          </Card>
        </Col>
        <Col xs={12} md={4} style={{ minWidth: '300px' }}>
          <Card className="p-3">
            <h6>Liquidity</h6>
            <h4>${liquidityTotal.toLocaleString()}</h4>
          </Card>
        </Col>
      </Row>

      {/* === Chain Filter Buttons === */}
      <div className="d-flex justify-content-center mb-3">
        <ButtonGroup>
          {['All', 'Ethereum', 'PulseChain', 'Binance', 'Polygon'].map((chain) => (
            <Button
              key={chain}
              variant={selectedChain === chain ? 'primary' : 'secondary'}
              onClick={() => setSelectedChain(chain)}
            >
              {chain}
            </Button>
          ))}
        </ButtonGroup>
      </div>

      {/* === Portfolio Growth === */}
      <Card className="mb-4 p-3">
        <h6>Portfolio Growth</h6>
        <Chart options={growthOptions} series={[{ name: 'Portfolio Value', data: growthData }]} type="area" height={300} />
      </Card>

      {/* === Bottom 3 Charts === */}
      <Row>
        <Col xs={12} md={4} style={{ minWidth: '300px' }}>
          <Card className="p-3">
            <h6>Portfolio Distribution</h6>
            <Chart options={distributionOptions} series={distributionSeries} type="pie" height={250} />
          </Card>
        </Col>
        <Col xs={12} md={4} style={{ minWidth: '300px' }}>
          <Card className="p-3">
            <h6>P/L Overview</h6>
            <Chart options={donutOptions('P/L Overview')} series={[plValue]} type="donut" height={250} />
          </Card>
        </Col>
        <Col xs={12} md={4} style={{ minWidth: '300px' }}>
          <Card className="p-3">
            <h6>Fear & Greed Index</h6>
            <Chart options={donutOptions('Fear & Greed Index')} series={[fgIndex]} type="donut" height={250} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
