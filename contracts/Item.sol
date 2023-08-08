// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { ERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import { ITreasury } from "./interfaces/ITreasury.sol";
import { IStakingStrategy } from "./interfaces/IStakingStrategy.sol";
import { IAddressBook } from "./interfaces/IAddressBook.sol";

import { GovernanceRole } from "./roles/GovernanceRole.sol";

// initialize(_governance, _treasury, "scooter", "SCT", 1000, 1000)
// initialize(_governance, _treasury, "moped", "MPD", 2000, 1000)
// initialize(_governance, _treasury, "bike", "BKE", 3000, 1000)
// initialize(_governance, _treasury, "car", "CAR", 5000, 1000)

contract Item is ReentrancyGuardUpgradeable, UUPSUpgradeable, ERC721Upgradeable, GovernanceRole {
    address public addressBook;
    uint256 public price;
    uint256 public maxSupply;
    uint256 public totalMintedAmount;
    uint256 public nextTokenId;
    address public treasury;

    mapping(uint256 => uint256) public amountInToken;
    mapping(uint256 => address) public tokenStakingStrategy;

    function initialize(
        address _governance,
        address _treasury,
        address _addressBook,
        string calldata _name,
        string calldata _symbol,
        uint256 _price,
        uint256 _maxSupply
    ) public initializer {
        __ERC721_init(_name, _symbol);
        governance = _governance;
        treasury = _treasury;
        addressBook = _addressBook;
        price = _price;
        maxSupply = _maxSupply;
    }

    function _authorizeUpgrade(address) internal view override {
        _enforceIsGovernance();
    }

    function _enfroceIsTokenOwner(uint256 _tokenId) internal view {
        require(ownerOf(_tokenId) == msg.sender, "tokenOwner!");
    }

    function mint(uint256 _amount, address _stakingStrategy, address _payToken, bytes memory _payload) external nonReentrant {
        require(IAddressBook(addressBook).stakingStrategies(_stakingStrategy), "stakingStrategy!");

        require(_amount > 0, "amount!");

        totalMintedAmount += _amount;

        require(maxSupply >= totalMintedAmount, "maxSupply!");

        uint256 totalPrice = _amount * price;
        uint256 payTokenAmount = ITreasury(treasury).usdAmountToToken(totalPrice, _payToken);

        IERC20Metadata(_payToken).transferFrom(msg.sender, treasury, payTokenAmount);

        uint256 tokenId = nextTokenId++;
        amountInToken[tokenId] = _amount;
        tokenStakingStrategy[tokenId] = _stakingStrategy;
        _safeMint(msg.sender, tokenId);
        IStakingStrategy(_stakingStrategy).stake(address(this), tokenId, _payload);
    }


    function burn(uint256 _tokenId) external {
        require(IAddressBook(addressBook).stakingStrategies(msg.sender), "only stakingStrategy!");
        _burn(_tokenId);
    }

    function tokenPrice(uint256 _tokenId) external view returns(uint256) {
        return price * amountInToken[_tokenId];
    }

    function stopSell() external {
        _enforceIsGovernance();
        maxSupply = totalMintedAmount;
    }
    
    function setNewMaxSupply(uint256 _maxSupply) external {
        _enforceIsGovernance();
        require(_maxSupply > maxSupply, "max supply less!");
        maxSupply = _maxSupply;
    }
}
