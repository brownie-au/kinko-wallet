// src/sections/dashboard/default/PortfolioHistoryTabs.jsx
/* eslint-disable import/no-relative-parent-imports */
import { useState } from 'react';
import { ButtonGroup, ToggleButton } from 'react-bootstrap';

import PortfolioValueCard from './PortfolioValueCard';
import TransactionHistoryCard from '../history/TransactionHistoryCard.jsx';

export default function PortfolioHistoryTabs() {
  const [tab, setTab] = useState('balance'); // 'balance' | 'history'

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-2">
        <div style={{ fontWeight: 600 }}>Wallet Overview</div>
        <ButtonGroup size="sm">
          <ToggleButton id="tab-balance" type="radio" variant={tab === 'balance' ? 'primary' : 'outline-secondary'} name="tab" value={'balance'} checked={tab==='balance'} onChange={() => setTab('balance')}>
            Portfolio Balance
          </ToggleButton>
          <ToggleButton id="tab-history" type="radio" variant={tab === 'history' ? 'primary' : 'outline-secondary'} name="tab" value={'history'} checked={tab==='history'} onChange={() => setTab('history')}>
            Transaction History
          </ToggleButton>
        </ButtonGroup>
      </div>
      {tab === 'balance' ? (
        <PortfolioValueCard />
      ) : (
        <TransactionHistoryCard />
      )}
    </div>
  );
}
