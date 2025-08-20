// src/menu-items/kw-staking.js
const staking = {
    id: 'kw-staking-mining',
    title: 'Staking & Mining',
    type: 'group',
    children: [
        {
            id: 'kw-hex-staking',
            title: 'HEX Staking',
            type: 'item',
            url: '/staking/hex',
            icon: 'ti ti-currency-ethereum', // matches your icon set; swap if needed
        },
        {
            id: 'kw-phex-staking',
            title: 'pHEX Staking',
            type: 'item',
            url: '/staking/phex',
            disabled: true // planned
        },
        {
            id: 'kw-eth-staking',
            title: 'ETH Staking',
            type: 'item',
            url: '/staking/eth',
            disabled: true // planned
        },
        {
            id: 'kw-etc-mining',
            title: 'ETC Mining',
            type: 'item',
            url: '/staking/etc',
            disabled: true // planned
        }
    ]
};

export default staking;
