import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory, Item__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]
  
  const ItemImplementationDeployment = await get('ItemImplementation')
  const AddressBookDeployment = await get('AddressBook')

  const alreadyDeployed = await getOrNull('MopedTestItem') != null
  if(alreadyDeployed) return

  const deployment = await deploy('MopedTestItem', {
    contract: 'ERC1967Proxy',
    from: deployer.address,
    args: [
      ItemImplementationDeployment.address,
      Item__factory.createInterface().encodeFunctionData('initialize', [
        AddressBookDeployment.address, // _addressBook
        'MopedTest', // _name
        'MPDT', // _symbol
        ethers.utils.parseUnits('45', 18), // _price
        2000, // _maxSupply
        'https://elct.com/metadata/moped_test/', // _uri
      ])
    ]
  })

  const addressBook = AddressBook__factory.connect(AddressBookDeployment.address, deployer)
  await (await addressBook.addItem(deployment.address)).wait(1)
}

deploy.tags = ['MopedTestItem']
deploy.dependencies = ['FiveYearsFlexStakingStrategy']
export default deploy
