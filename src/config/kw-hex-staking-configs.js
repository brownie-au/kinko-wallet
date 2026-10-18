// Public contract identity; RPC network still selects PulseChain or Ethereum.
// Source: https://hex.com/links/
export const DEFAULT_HEX_ADDRESS = '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39';

export const KW_STAKING_HEX_PULSE = {
    id: 'hex-pulse',
    title: 'HEX Staking',
    badge: 'PULSECHAIN',
    unit: 'HEX',
    chain: 'pulse',
    chainId: 369,
    rpcUrl: import.meta.env.VITE_PLS_RPC_URL || 'https://rpc.pulsechain.com',
    hexAddress: (import.meta.env.VITE_PLS_HEX_ADDRESS || DEFAULT_HEX_ADDRESS).trim(),
    priceKey: 'HEX'
};

export const KW_STAKING_EHEX_ETH = {
    id: 'ehex-eth',
    title: 'eHEX Staking',
    badge: 'ETHEREUM',
    unit: 'eHEX',
    chain: 'ethereum',
    chainId: 1,
    rpcUrl: import.meta.env.VITE_ETH_RPC_URL || 'https://eth.llamarpc.com',
    hexAddress: (import.meta.env.VITE_ETH_HEX_ADDRESS || DEFAULT_HEX_ADDRESS).trim(),
    priceKey: 'eHEX'
};
