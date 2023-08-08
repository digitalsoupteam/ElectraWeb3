import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { Governance__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const deployment = await deploy('ItemImplementation', {
    contract: 'Item',
    from: deployer.address,
  })

  const GovernanceDeployment = await get('Governance')
  const governance = Governance__factory.connect(GovernanceDeployment.address, deployer)

  await (await governance.setItemImplementation(deployment.address)).wait()

  await (
    await governance.addItem(
      'SCOOTER', // _name
      'SCT', // _symbol
      1000, // _price
      1000, // _maxSupply
    )
  ).wait()

  await (
    await governance.addItem(
      'BIKE', // _name
      'BKE', // _symbol
      3000, // _price
      1000, // _maxSupply
    )
  ).wait()

  await (
    await governance.addItem(
      'MOPED', // _name
      'MPD', // _symbol
      2000, // _price
      1000, // _maxSupply
    )
  ).wait()

  await (
    await governance.addItem(
      'CAR', // _name
      'CAR', // _symbol
      4000, // _price
      1000, // _maxSupply
    )
  ).wait()
}

deploy.tags = ['ItemImplementation']
deploy.dependencies = ['Governance', 'Treasury', 'AddressBook']
export default deploy
