import { deployments, ethers } from 'hardhat'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { StakingERC1155, StakingERC1155__factory } from '../typechain-types'

describe(`StakingERC1155`, () => {
  let stakingERC1155: StakingERC1155

  let initSnapshot: string

  let owner: SignerWithAddress

  before(async () => {
    const accounts = await ethers.getSigners()
    owner = accounts[0]

    await deployments.fixture([
      'StakingERC1155',
    ])
    const StakingERC1155Deployment = await deployments.get('StakingERC1155')

    stakingERC1155 = StakingERC1155__factory.connect(StakingERC1155Deployment.address, owner)

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  it('Regular unit', async () => {})
})
