// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { ERC721EnumerableUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StakingERC1155 is OwnableUpgradeable, ERC721EnumerableUpgradeable {
    mapping(string => uint256) public items;
    mapping(uint256 => uint256) public lockPeriods;
    uint256 public nextTokenId;
    uint256 public rewardsPeriod;

    mapping(uint256 => TokenInfo) public tokensInfo;

    struct TokenInfo {
        string itemName;
        uint256 lockPeriod;
        uint256 rewardsRate;
        uint256 buyPrice;
        uint256 sellPrice;
        uint256 initTimestamp;
        uint256 lastRewardTimestamp;
        uint256 withdrawnRewards;
    }

    event Buy(address indexed recipient, uint256 indexed tokenId);
    event ClaimRewards(address indexed recipient, uint256 indexed tokenId);
    event Sell(address indexed recipient, uint256 indexed tokenId);

    function initialize() public initializer {
        __Ownable_init();
        __ERC721_init("MyToken", "MTK");

        items["electric scooter"] = 1000;
        items["electric moped"] = 1000;
        items["electric bycicle"] = 1000;
        items["electric car"] = 1000;

        lockPeriods[1] = 1000;
        lockPeriods[2] = 2000;
        lockPeriods[3] = 2500;

        rewardsPeriod = 30 days;
    }

    function addItem(string calldata _name, uint256 _price) external onlyOwner {
        require(items[_name] == 0, "StakingERC1155: item already exists!");
        items[_name] = _price;
    }

    function updateItemPrice(string calldata _name, uint256 _price) external onlyOwner {
        require(_price > 0, "StakingERC1155: can not set price 0, use deleteItem");
        require(items[_name] > 0, "StakingERC1155: item not exists!");
        items[_name] = _price;
    }

    function deleteItem(string calldata _name) external onlyOwner {
        require(items[_name] > 0, "StakingERC1155: item not exists!");
        delete items[_name];
    }

    function buy(string calldata _itemName, uint256 _lockPeriod) external {
        uint256 itemPrice = items[_itemName];
        require(itemPrice > 0, "StakingERC1155: item not exists!");

        uint256 rewardsRate = lockPeriods[_lockPeriod];
        require(rewardsRate > 0, "StakingERC1155: lockPeriod not exists!");

        address tokenForBuy = address(0);

        IERC20(tokenForBuy).transferFrom(msg.sender, address(this), itemPrice);

        uint256 sellPrice = (itemPrice * 9) / 10;

        uint256 tokenId = nextTokenId++;
        _safeMint(msg.sender, tokenId);
        tokensInfo[tokenId] = TokenInfo({
            itemName: _itemName,
            lockPeriod: _lockPeriod,
            rewardsRate: rewardsRate,
            buyPrice: itemPrice,
            sellPrice: sellPrice,
            initTimestamp: block.timestamp,
            lastRewardTimestamp: block.timestamp,
            withdrawnRewards: 0
        });

        emit Buy(msg.sender, tokenId);
    }

    function claimRewards(uint256 _tokenId) external {
        require(ownerOf(_tokenId) == msg.sender, "StakingERC1155: not token owner!");

        TokenInfo memory tokenInfo = tokensInfo[_tokenId];

        uint256 rewardsPeriodsCount = (block.timestamp - tokenInfo.lastRewardTimestamp) /
            rewardsPeriod;
        uint256 rewardForOnePeriod = (tokenInfo.buyPrice * tokenInfo.rewardsRate) / 10000;
        uint256 allCurrentRewards = rewardsPeriodsCount * rewardForOnePeriod;
        uint256 rewardsThatCanBeWithdrawn = allCurrentRewards - tokenInfo.withdrawnRewards;

        require(rewardsThatCanBeWithdrawn > 0, "StakingERC1155: no rewards to withdraw!");

        address withdrawnToken = address(0);

        IERC20(withdrawnToken).transfer(msg.sender, rewardsThatCanBeWithdrawn);

        emit ClaimRewards(msg.sender, _tokenId);
    }

    function sell(uint256 _tokenId) external {
        require(ownerOf(_tokenId) == msg.sender, "StakingERC1155: not token owner!");

        TokenInfo memory tokenInfo = tokensInfo[_tokenId];

        require(
            block.timestamp >= tokenInfo.initTimestamp + tokenInfo.lockPeriod * 365 days,
            "StakingERC1155: blocking period has not expired!"
        );

        _burn(_tokenId);

        address withdrawnToken = address(0);

        IERC20(withdrawnToken).transfer(msg.sender, tokenInfo.sellPrice);

        emit Sell(msg.sender, _tokenId);
    }
}
