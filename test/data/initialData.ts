import { ethers } from "ethers";
import { BNB_PLACEHOLDER, BUSD, CHAINLINK_BNB_USD, CHAINLINK_BUSD_USD, CHAINLINK_USDT_USD, USDT } from "../../constants/addresses";

export const INITIAL_DATA = {
  strategies: [
    {
      name: 'FLEX',
      roundInOnePeriod: 4,
    },
    {
      name: 'STABLE',
      roundInOnePeriod: 4,
    },
  ],
  tokens: [
    {
      address: BNB_PLACEHOLDER,
      pricer: CHAINLINK_BNB_USD,
    },
    {
      address: BUSD,
      pricer: CHAINLINK_BUSD_USD,
    },
    {
      address: USDT,
      pricer: CHAINLINK_USDT_USD,
    },
  ],
  items: [
    {
      id: 0,
      name: 'SCOOTER',
      price: ethers.utils.parseUnits('1000', 18),
    },
    {
      id: 1,
      name: 'SKATE',
      price: ethers.utils.parseUnits('2000', 18),
    },
    {
      id: 2,
      name: 'MOPED',
      price: ethers.utils.parseUnits('3000', 18),
    },
    {
      id: 3,
      name: 'CAR',
      price: ethers.utils.parseUnits('5000', 18),
    },
  ],
}