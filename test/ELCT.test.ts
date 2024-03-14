import { deployments, ethers } from 'hardhat'
import { assert, expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { AddressBook, AddressBook__factory, ELCT, ELCT__factory } from '../typechain-types'
import { getImplementationAddress } from '@openzeppelin/upgrades-core'

const INITIAL_DATA = {
  totalSupply: ethers.utils.parseUnits('1000000000', 18),
}

describe(`ELCT`, () => {
  let initSnapshot: string
  let user: SignerWithAddress
  let owner: SignerWithAddress
  let addressBook: AddressBook
  let elct: ELCT

  before(async () => {
    const accounts = await ethers.getSigners()
    owner = accounts[0]
    user = accounts[1]

    await deployments.fixture()

    addressBook = AddressBook__factory.connect(
      (await deployments.get('AddressBook')).address,
      ethers.provider,
    )

    elct = ELCT__factory.connect(
      (await deployments.get('ELCT')).address,
      ethers.provider,
    )

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  it('Initial data: totalSupply', async () => {
    const totalSupply = await elct.totalSupply()
    assert(
      totalSupply.eq(INITIAL_DATA.totalSupply),
      `totalSupply != INITIAL_DATA.totalSupply. ${totalSupply} != ${INITIAL_DATA.totalSupply}`,
    )
  })

  it('Initial data: owner balance', async () => {
    const ownerBalance = await elct.balanceOf(owner.address)
    assert(
      ownerBalance.eq(INITIAL_DATA.totalSupply),
      `ownerBalance != INITIAL_DATA.totalSupply. ${ownerBalance} != ${INITIAL_DATA.totalSupply}`,
    )
  })

  it('Regular unit: Upgarde only owner', async () => {
    const elctFactory = await ethers.getContractFactory('ELCT')
    const newELCT = await elctFactory.deploy()
    const newImplementationAddress = newELCT.address
    await elct.connect(owner).upgradeTo(newImplementationAddress)
    const implementationAddress = await getImplementationAddress(ethers.provider, elct.address)
    assert(
      newImplementationAddress == implementationAddress,
      `newImplementationAddress != implementationAddress. ${newImplementationAddress} != ${implementationAddress}`,
    )
  })

  it('Regular: Upgarde only owner', async () => {
    const elctFactory = await ethers.getContractFactory('ELCT')
    const newELCT = await elctFactory.deploy()

    await elct.connect(owner).upgradeTo(newELCT.address)
    const implementationAddress = await getImplementationAddress(ethers.provider, elct.address)
    assert(
      implementationAddress == newELCT.address,
      `implementationAddress != newELCT.address. ${implementationAddress} != ${newELCT.address}`,
    )
  })

  it('Error unit: Upgarde not owner', async () => {
    await expect(
      elct.connect(user).upgradeTo(ethers.constants.AddressZero),
    ).to.be.revertedWith('only product owner!')
  })
})
