import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const items = [
    {
      name: 'electric scooter',
      price: 1000,
    },
    {
      name: 'electric moped',
      price: 1000,
    },
    {
      name: 'electric bike',
      price: 1000,
    },
    {
      name: 'electric car',
      price: 1000,
    },
  ]

  const lockPeriods = [
    {
      lockTime: 1,
      rewardsRate: 1000,
    },
    {
      lockTime: 2,
      rewardsRate: 2000,
    },
    {
      lockTime: 3,
      rewardsRate: 2500,
    },
  ]

  const supportedTokens = [
    {
      token: '0xe9e7cea3dedca5984780bafc599bd69add087d56',
      pricer: '0xcBb98864Ef56E9042e7d2efef76141f15731B82f',
    }, // BUSD
    {
      token: '0x55d398326f99059ff775485246999027b3197955',
      pricer: '0xb97ad0e74fa7d920791e90258a6e2085088b4320',
    }, // USDT
  ]

  const deployment = await deploy('RentStaking', {
    contract: 'RentStaking',
    from: deployer.address,
    proxy: {
      proxyContract: 'OpenZeppelinTransparentProxy',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            'RentStaking', // _nftName
            'RentStaking', // _nftSymbol
            items, // _items
            lockPeriods,  // _lockPeriods
            supportedTokens, // _supportedTokens
          ],
        },
      },
    },
  })
}

deploy.tags = ['RentStaking']
export default deploy
