import { getAddress } from 'ethers';
export const isAddress = (value) => {
  try {
    return !!getAddress(String(value).trim());
  } catch {
    return false;
  }
};
