import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { BNB_PLACEHOLDER, CHAINLINK_BNB_USD, CHAINLINK_USDT_USD, USDT, WBNB } from '../constants/addresses'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const AddressBookDeployment = await get('AddressBook')  
  const ELCTDeployment = await get('ELCT')
  const ElctPricerDeployment = await get('ElctPricer')

  const alreadyDeployed = await getOrNull('ElctPresale') != null
  if(alreadyDeployed) return
  
  await deploy('ElctPresale', {
    contract: 'ElctPresale',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: { 
          methodName: 'initialize',
          args: [
            AddressBookDeployment.address, // _addressBook
            ELCTDeployment.address, // _elct
            ElctPricerDeployment.address, // _elctPricer
            [
              BNB_PLACEHOLDER, 
              WBNB,
              USDT, 
            ], // _payTokens
            [
              CHAINLINK_BNB_USD,
              CHAINLINK_BNB_USD,
              CHAINLINK_USDT_USD,
            ], // _payTokensPricers
          ],
        },
      },
    },
  })
}

deploy.tags = ['ElctPresale']
deploy.dependencies = ['ElctPricer']
export default deploy
