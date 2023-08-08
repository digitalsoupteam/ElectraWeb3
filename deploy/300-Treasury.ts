import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { Governance__factory } from '../typechain-types'
import { BNB_PLACEHOLDER, BUSD, CHAINLINK_BNB_USD, CHAINLINK_BUSD_USD, CHAINLINK_USDT_USD, USDT } from '../constants/addresses'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const GovernanceDeployment = await get('Governance')
  const AddressBookDeployment = await get('AddressBook')
  const UsdtStaticPricerDeployment = await get('UsdtStaticPricer')

  const deployment = await deploy('Treasury', {
    contract: 'Treasury',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            GovernanceDeployment.address, // _governance
            AddressBookDeployment.address, // _addressBook
          ],
        },
      },
    },
  })

  const governance = Governance__factory.connect(GovernanceDeployment.address, deployer)

  await (await governance.setTreasury(deployment.address)).wait()
  
  await (await governance.addToken(BNB_PLACEHOLDER, CHAINLINK_BNB_USD)).wait()
  await (await governance.addToken(BUSD, CHAINLINK_BUSD_USD)).wait()
  await (await governance.addToken(USDT, UsdtStaticPricerDeployment.address)).wait()
}

deploy.tags = ['Treasury']
deploy.dependencies = ['Governance', 'AddressBook', 'UsdtStaticPricer']
export default deploy
