import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { Governance__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const GovernanceDeployment = await get('Governance')
  const TreasuryDeployment = await get('Treasury')
  const AddressBookDeployment = await get('AddressBook')

  const deployment = await deploy('FlexStakingStrategy', {
    contract: 'FlexStakingStrategy',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            GovernanceDeployment.address, // _governance
            TreasuryDeployment.address, // _treasury
            AddressBookDeployment.address, // _addressBook
            2, // _minLockYears
            5, // _maxLockYears
            4, // _initialMonths
            100, // _initialRewardsRate
            1500, // _yearDeprecationRate
          ],
        },
      },
    },
  })
  

  const governance = Governance__factory.connect(GovernanceDeployment.address, deployer)

  await (await governance.addStakingStrategy(deployment.address)).wait()
}

deploy.tags = ['FlexStakingStrategy']
deploy.dependencies = ['Governance', 'Treasury', 'AddressBook']
export default deploy
