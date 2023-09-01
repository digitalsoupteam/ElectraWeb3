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

  const deployment = await deploy('BikeItem', {
    contract: 'ERC1967Proxy',
    from: deployer.address,
    args: [
      ItemImplementationDeployment.address,
      Item__factory.createInterface().encodeFunctionData('initialize', [
        AddressBookDeployment.address, // _addressBook
        'BIKE', // _name
        'BKE', // _symbol
        3000, // _price
        1000, // _maxSupply
        'https://elct.com/metadata/bike/', // _uri
      ])
    ]
  })

  const addressBook = AddressBook__factory.connect(AddressBookDeployment.address, deployer)

  await (await addressBook.addItem(deployment.address)).wait()
}

deploy.tags = ['BikeItem']
deploy.dependencies = ['ItemImplementation', 'AddressBook']
export default deploy
