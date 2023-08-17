import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory, FlexStakingStrategy__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]
  
  const FlexStakingStrategyImplementationDeployment = await get('FlexStakingStrategyImplementation')
  const AddressBookDeployment = await get('AddressBook')

  const deployment = await deploy('FiveYearsFlexStakingStrategy', {
    contract: 'ERC1967Proxy',
    from: deployer.address,
    args: [
      FlexStakingStrategyImplementationDeployment.address,
      FlexStakingStrategy__factory.createInterface().encodeFunctionData('initialize', [
        AddressBookDeployment.address, // _addressBook
        2, // _minLockYears
        5, // _maxLockYears
        4, // _initialMonths
        100, // _initialRewardsRate
        1500, // _yearDeprecationRate
      ])
    ]
  })

  const addressBook = AddressBook__factory.connect(AddressBookDeployment.address, deployer)

  await (await addressBook.addStakingStrategy(deployment.address)).wait()
}

deploy.tags = ['FiveYearsFlexStakingStrategy']
deploy.dependencies = ['FlexStakingStrategyImplementation', 'AddressBook']
export default deploy
