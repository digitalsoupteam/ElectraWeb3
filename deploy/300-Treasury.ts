import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory, Treasury__factory } from '../typechain-types'
import { BNB_PLACEHOLDER, CHAINLINK_BNB_USD, CHAINLINK_USDT_USD, USDT, WBNB } from '../constants/addresses'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const AddressBookDeployment = await get('AddressBook')
  const ELCTDeployment = await get('ELCT')
  const ElctPricerDeployment = await get('ElctPricer')

  const alreadyDeployed = await getOrNull('Treasury') != null
  if(alreadyDeployed) return
  
  const deployment = await deploy('Treasury', {
    contract: 'Treasury',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            AddressBookDeployment.address, // _addressBook
          ],
        },
      },
    },
  })

  const addressBook = AddressBook__factory.connect(AddressBookDeployment.address, deployer)
  await (await addressBook.setTreasury(deployment.address)).wait(1)

  const treasury = Treasury__factory.connect(deployment.address, deployer)
  await (await treasury.addToken(USDT, CHAINLINK_USDT_USD)).wait(1)
  await (await treasury.addToken(BNB_PLACEHOLDER, CHAINLINK_BNB_USD)).wait(1)
  await (await treasury.addToken(WBNB, CHAINLINK_BNB_USD)).wait(1)
  await (await treasury.addToken(ELCTDeployment.address, ElctPricerDeployment.address)).wait(1)
}

deploy.tags = ['Treasury']
deploy.dependencies = ['ElctPresale']
export default deploy
