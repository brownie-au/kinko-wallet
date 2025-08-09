// src/data/wallets.js
// Use FULL 0x addresses. 'chain' should be: 'pulse' | 'eth' | 'base' (we default others to 'eth').

const wallets = [
  // --- EXAMPLES: replace addresses below with your real ones ---
  {
    id: '0xfae8',                    // optional, display-only
    name: 'FATO',
    address: '0xFAE8...D60A',        // <-- full address here
    chain: 'pulse'                   // <-- this makes the PulseChain fetch kick in
  },
  {
    id: '0xf047',
    name: 'HEX Main',
    address: '0xF047...XXXX',        // full address
    chain: 'pulse'
  },
  {
    id: '0xbc16',
    name: 'Fatto 1',
    address: '0xBC16...YYYY',        // full address
    chain: 'eth'
  },
  {
    id: '0xb2d0',
    name: 'Ledger',
    address: '0xB2D0...ZZZZ',        // full address
    chain: 'eth'                     // (we don’t fetch BSC/Polygon yet in this view)
  },
  {
    id: '0x2b03',
    name: 'Spare',
    address: '0x2B03...ABCD',        // full address
    chain: 'eth'
  }
];

export default wallets;
