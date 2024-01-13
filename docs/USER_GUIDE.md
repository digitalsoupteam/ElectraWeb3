![logo](https://github.com/inveker/staking/blob/main/docs/images/logo.png) 

# User guide

## 1. Buy NFT Item token from Item.sol smart-contract

Solidity function signature
```solidity
Item.mint(
    address _stakingStrategy,
    address _payToken,
    bytes memory _payload
);
```
This method emit Mint event from Item.sol
```solidity
event Mint(
    address indexed owner,
    uint256 indexed tokenId,
    address indexed stakingStartegy,
    address payToken
);
```
And emit Stake event from StakingStrategy.sol
```solidity
event Stake(
    address itemAddress,
    uint256 itemId,
    address itemOwner,
    uint256 itemsPrice,
    uint256 initialTimestamp,
    uint256 finalTimestamp
);
```
ethers.js call example
```typescript
await payToken.approve(item.address, itemPrice)
await item.mint(stakingStrategy, payToken.address, '0x')
```

<br/>

## 2. Claim rewards from StakingStrategy.sol smart-contract
   
Solidity function signature
```solidity
StakingStrategy.claim(
    address _itemAddress,
    uint256 _itemId,
    address _withdrawToken
);
```
This method emit Claim event
```solidity
event Claim(
    address itemAddress,
    uint256 itemId,
    address itemOwner,
    uint256 rewards,
    uint256 claimedPeriods,
    address withdrawToken,
    uint256 withdrawTokenAmount
);
```
ethers.js example
```typescript
await stakingStrategy.claim(item.address, tokenId, withdrawToken.address)
```
<br/>

## 3.  Sell your Item NFT token
   
Solidity function signature
```solidity
StakingStrategy.sell(
    address _itemAddress,
    uint256 _itemId,
    address _withdrawToken
);
```
This method emit Mint event
```solidity
event Sell(
    address itemAddress,
    uint256 itemId,
    address itemOwner,
    uint256 sellPrice,
    address withdrawToken,
    uint256 withdrawTokenAmount
);
```
ethers.js example
```typescript
await stakingStrategy.sell(item.address, tokenId, withdrawToken.address)
```
