![logo](https://github.com/inveker/staking/blob/main/docs/images/logo.png) 

# Admin guide

## Set new ProductOwner

```solidity
AddressBook.setProductOwner(address _newProductOwner);
```

<br/>

## Add item

1. Deploy new Item.sol contract
2. Call 
```solidity
AddressBook.addItem(address _newItem);
```

<br/>

## Delete item

1. Stop items sell
```solidity
Item.stopSell();
```
2. Call 
```solidity
AddressBook.deleteItem(address _newItem);
```

<br/>

## Add staking strategy

1. Deploy new StakingStrategy.sol contract
2. Call 
```solidity
AddressBook.addStakingStrategy(address _stakingStrategy);
```

<br/>

## Delete staking strategy

```solidity
AddressBook.deleteStakingStrategy(address _stakingStrategy);
```

<br/>

## Stop item sell

```solidity
Item.stopSell();
```

<br/>

## Set new max supply

```solidity
Item.setNewMaxSupply(uint256 _maxSupply);
```

<br/>

## Set only ProductOwner withdrawn

```solidity
Treasury.setOnlyProductOwnerWithdrawn(bool _value);
```

<br/>

## Add new token

```solidity
Treasury.addToken(address _token, address _pricer);
```

<br/>

## Add update token pricer

```solidity
Treasury.updateTokenPricer(address _token, address _pricer);
```
<br/>

## Add delete token

```solidity
Treasury.deleteToken(address _token);
```

<br/>

## Set earnings for FixStakingStartegies

1. Update deposits
```solidity
AddressBook.setEarnings(uint256 _year, uint256 _month, uint256 _formatedEarning);
```
2. Set earnings
```solidity
AddressBook.updateDeposits();
```

<br/>

## Set price for pricer

```solidity
Pricer.setCurrentPrice(int256 _newPrice);
```