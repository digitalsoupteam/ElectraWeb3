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

  const alreadyDeployed = await getOrNull('MopedSparePartItem') != null
  if(alreadyDeployed) return

  const deployment = await deploy('MopedSparePartItem', {
    contract: 'ERC1967Proxy',
    from: deployer.address,
    args: [
      ItemImplementationDeployment.address,
      Item__factory.createInterface().encodeFunctionData('initialize', [
        AddressBookDeployment.address, // _addressBook
        'Moped Spare Part', // _name
        'MSP', // _symbol
        ethers.utils.parseUnits('290', 18), // _price
        2400, // _maxSupply
        'https://elct.com/metadata/moped_spare_part/', // _uri
      ])
    ]
  })

  const addressBook = AddressBook__factory.connect(AddressBookDeployment.address, deployer)
  await (await addressBook.addItem(deployment.address)).wait(1)
}

deploy.tags = ['MopedSparePartItem']
deploy.dependencies = ['MopedItem']
export default deploy
