import React from "react";
import { Doughnut, Line } from "react-chartjs-2";
import GaugeChart from "react-gauge-chart";
import "chart.js/auto";

const Card = ({ title, value }) => (
  <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-black p-6 rounded-2xl shadow-lg flex flex-col items-center hover:shadow-2xl transition duration-300">
    <h3 className="text-gray-400 text-sm tracking-wide">{title}</h3>
    <p className="text-2xl font-bold text-white">{value}</p>
  </div>
);

export default function PortfolioDashboard() {
  const portfolioData = {
    labels: ["Ethereum", "PulseChain", "Binance", "Polygon"],
    datasets: [
      {
        data: [30, 25, 25, 20],
        backgroundColor: ["#4BC0C0", "#FF6384", "#FFCE56", "#36A2EB"],
        borderWidth: 0
      }
    ]
  };

  const plOverview = {
    labels: ["Profit", "Loss"],
    datasets: [
      {
        data: [82, 18],
        backgroundColor: ["#36A2EB", "#FF6384"],
        borderWidth: 0
      }
    ]
  };

  const growthData = {
    labels: Array.from({ length: 30 }, (_, i) => `Day ${i + 1}`),
    datasets: [
      {
        label: "Portfolio Growth",
        data: [
          3587, 2173, 2961, 2502, 1884, 2043, 1799, 3656, 3533, 1075, 1538, 4608,
          2998, 3378, 4402, 4647, 1930, 3313, 3724, 2093, 1064, 1149, 1502, 4128
        ],
        fill: true,
        borderColor: "#4BC0C0",
        backgroundColor: "rgba(75,192,192,0.15)",
        tension: 0.3
      }
    ]
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white font-sans p-8 space-y-6">
      {/* Wallet summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card title="Wallets" value="$73,742.37" />
        <Card title="Staking" value="$2,500" />
        <Card title="Liquidity" value="$1,471" />
      </div>

      {/* Portfolio growth chart */}
      <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-black p-6 rounded-2xl shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-gray-300">
          Portfolio Growth
        </h2>
        <Line data={growthData} />
      </div>

      {/* Bottom widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-black p-6 rounded-2xl shadow-lg">
          <h2 className="text-lg font-semibold mb-4 text-gray-300">
            Portfolio Distribution
          </h2>
          <Doughnut data={portfolioData} />
        </div>

        <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-black p-6 rounded-2xl shadow-lg">
          <h2 className="text-lg font-semibold mb-4 text-gray-300">
            P/L Overview
          </h2>
          <Doughnut data={plOverview} />
        </div>

        <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-black p-6 rounded-2xl shadow-lg text-center">
          <h2 className="text-lg font-semibold mb-4 text-gray-300">
            Fear &amp; Greed Index
          </h2>
          <GaugeChart
            id="fear-greed-gauge"
            nrOfLevels={5}
            arcsLength={[0.2, 0.2, 0.2, 0.2, 0.2]}
            colors={["#FF4E42", "#FF9900", "#FFD700", "#A3D977", "#4CAF50"]}
            percent={0.67}
            arcWidth={0.3}
            textColor="#fff"
          />
          <h2 className="mt-2 text-2xl font-bold text-green-400">67</h2>
          <p className="text-gray-400">Greed</p>
        </div>
      </div>
    </div>
  );
}
