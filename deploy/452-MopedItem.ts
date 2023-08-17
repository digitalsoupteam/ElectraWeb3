import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory, Item__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]
  
  const ItemImplementationDeployment = await get('ItemImplementation')
  const AddressBookDeployment = await get('AddressBook')

  const deployment = await deploy('MopedItem', {
    contract: 'ERC1967Proxy',
    from: deployer.address,
    args: [
      ItemImplementationDeployment.address,
      Item__factory.createInterface().encodeFunctionData('initialize', [
        AddressBookDeployment.address, // _addressBook
        'MOPED', // _name
        'MPD', // _symbol
        2000, // _price
        1000, // _maxSupply
      ])
    ]
  })

  const addressBook = AddressBook__factory.connect(AddressBookDeployment.address, deployer)

  await (await addressBook.addItem(deployment.address)).wait()
}

deploy.tags = ['MopedItem']
deploy.dependencies = ['ItemImplementation', 'AddressBook']
export default deploy
