import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory, FixStakingStrategy__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]
  
  const FixStakingStrategyImplementationDeployment = await get('FixStakingStrategyImplementation')
  const AddressBookDeployment = await get('AddressBook')

  const deployment = await deploy('TwoYearsFixStakingStrategy', {
    contract: 'ERC1967Proxy',
    from: deployer.address,
    args: [
      FixStakingStrategyImplementationDeployment.address,
      FixStakingStrategy__factory.createInterface().encodeFunctionData('initialize', [
        AddressBookDeployment.address, // _addressBook
        600, // _rewardsRate
        2, // _lockYears
        0, // _yearDeprecationRate
      ])
    ]
  })

  const alreadyDeployed = await getOrNull('TwoYearsFixStakingStrategy') !== null
  if(alreadyDeployed) return

  const addressBook = AddressBook__factory.connect(AddressBookDeployment.address, deployer)
  await (await addressBook.addStakingStrategy(deployment.address)).wait(1)
}

deploy.tags = ['TwoYearsFixStakingStrategy']
deploy.dependencies = ['FixStakingStrategyImplementation', 'AddressBook']
export default deploy
