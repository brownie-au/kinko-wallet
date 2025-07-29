// src/services/moralisService.js
const MORALIS_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6ImFlMDdlN2UzLTFmN2QtNDBhNy1hNjBlLWI5ODczOGE0ZWIwZCIsIm9yZ0lkIjoiNDYyMTI4IiwidXNlcklkIjoiNDc1NDMzIiwidHlwZUlkIjoiYzhmNDhmMjctYzcyYy00YjhlLWI2ZTEtMWJhNGVkM2IxNTY5IiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NTM3NzA3OTcsImV4cCI6NDkwOTUzMDc5N30.HPj3-I0djQOYv8IU0JcGBSd4etxJ_hV3MXcNeDAuxds';

export async function fetchMoralisTokens(address, chain = 'eth') {
  try {
    const res = await fetch(`https://deep-index.moralis.io/api/v2.2/${address}/erc20?chain=${chain}`, {
      headers: {
        'accept': 'application/json',
        'X-API-Key': MORALIS_API_KEY
      }
    });
    if (!res.ok) throw new Error('Failed to fetch tokens');
    return await res.json();
  } catch (err) {
    console.error('[Moralis] Fetch error:', err);
    return [];
  }
}
