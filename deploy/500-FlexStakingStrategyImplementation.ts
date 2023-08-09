import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { Governance__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const deployment = await deploy('FlexStakingStrategyImplementation', {
    contract: 'FlexStakingStrategy',
    from: deployer.address,
  })

  const GovernanceDeployment = await get('Governance')
  const governance = Governance__factory.connect(GovernanceDeployment.address, deployer)

  await (await governance.setFlexStakingStrategyImplementation(deployment.address)).wait()

  await (
    await governance.addFlexStakingStrategy(
      2, // _minLockYears
      5, // _maxLockYears
      4, // _initialMonths
      100, // _initialRewardsRate
      1500, // _yearDeprecationRate
    )
  ).wait()
}

deploy.tags = ['FlexStakingStrategyImplementation']
deploy.dependencies = ['Governance', 'Treasury', 'AddressBook']
export default deploy
