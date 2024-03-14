import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import '@nomiclabs/hardhat-etherscan'
import 'hardhat-deploy'
import 'hardhat-gas-reporter'
import 'hardhat-tracer'
import 'hardhat-abi-exporter'
import '@nomicfoundation/hardhat-chai-matchers'
import 'hardhat-contract-sizer'
import CONFIG from './config.json'

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.18',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
    ],
  },
  networks: {
    binance: {
      url: 'https://rpc.ankr.com/bsc',
      accounts: [CONFIG.privateKey]
    },
    binanceTestnet: {
      url: 'https://rpc.ankr.com/bsc_testnet_chapel',
      accounts: [CONFIG.privateKey]
    },
    hardhat: {
      chainId: 1337,
      forking: {
        url: 'https://rpc.ankr.com/bsc',
        blockNumber: 36961810,
      },
      blockGasLimit: 30000000,
      accounts: {
        count: 10,
        accountsBalance: '1000000000000000000000000000',
      },
      loggingEnabled: false,
    }
  },
  abiExporter: {
    path: './abi',
  },
  gasReporter: {
    enabled: true,
    currency: 'USD',
    gasPrice: 30,
  },
  mocha: {
    timeout: 100000000,
  },
  tracer: {
    tasks: ['deploy'],
  },
}

export default config