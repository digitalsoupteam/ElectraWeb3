import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { Governance__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const deployment = await deploy('FixStakingStrategyImplementation', {
    contract: 'FixStakingStrategy',
    from: deployer.address,
  })

  const GovernanceDeployment = await get('Governance')
  const governance = Governance__factory.connect(GovernanceDeployment.address, deployer)

  await (await governance.setFixStakingStrategyImplementation(deployment.address)).wait()

  await (
    await governance.addFixStakingStrategy(
      400, // _rewardsRate
      2, // _lockYears
      0, // _yearDeprecationRate
    )
  ).wait()

  await (
    await governance.addFixStakingStrategy(
      800, // _rewardsRate
      3, // _lockYears
      0, // _yearDeprecationRate
    )
  ).wait()

  await (
    await governance.addFixStakingStrategy(
      1200, // _rewardsRate
      5, // _lockYears
      0, // _yearDeprecationRate
    )
  ).wait()
}

deploy.tags = ['FixStakingStrategyImplementation']
deploy.dependencies = ['Governance', 'Treasury', 'AddressBook']
export default deploy
