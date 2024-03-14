// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { ERC721EnumerableUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IAddressBook } from "../interfaces/IAddressBook.sol";
import { IItem } from "../interfaces/IItem.sol";
import { ITreasury } from "../interfaces/ITreasury.sol";
import { IStakingStrategy } from "../interfaces/IStakingStrategy.sol";
import { MulticallUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";

contract Item is
    IItem,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable,
    ERC721EnumerableUpgradeable,
    MulticallUpgradeable
{
    // ------------------------------------------------------------------------------------
    // ----- LIBRARIES --------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    using SafeERC20 for IERC20Metadata;

    // ------------------------------------------------------------------------------------
    // ----- STORAGE ----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    address public addressBook;
    uint256 public price;
    uint256 public maxSupply;
    uint256 public totalMintedAmount;
    uint256 public nextTokenId;
    mapping(uint256 tokenId => address) public tokenStakingStrategy;
    string internal uri;

    // ------------------------------------------------------------------------------------
    // ----- EVENTS -----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    event Mint(
        address indexed owner,
        uint256 indexed tokenId,
        address indexed stakingStartegy,
        address payToken
    );

    // ------------------------------------------------------------------------------------
    // ----- DEPLOY & UPGRADE  ------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _addressBook,
        string calldata _name,
        string calldata _symbol,
        uint256 _price,
        uint256 _maxSupply,
        string calldata _uri
    ) public initializer {
        require(_addressBook != address(0), "_addressBook!");
        __ERC721_init(_name, _symbol);
        addressBook = _addressBook;
        price = _price;
        maxSupply = _maxSupply;
        uri = _uri;
    }

    function _authorizeUpgrade(address) internal view override {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
    }

    // ------------------------------------------------------------------------------------
    // ----- USER ACTIONS  ----------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function mint(
        uint256 _mintAmount,
        address _stakingStrategy,
        address _payToken,
        uint256 _maxPayTokenAmount,
        bytes memory _payload
    ) external payable nonReentrant {
        require(_mintAmount > 0, "_mintAmount iz zero!");
        // Load deps
        IAddressBook _addressBook = IAddressBook(addressBook);
        ITreasury treasury = ITreasury(_addressBook.treasury());
        // Validate args
        require(maxSupply >= ++totalMintedAmount, "maxSupply!");
        _addressBook.enforceIsStakingStrategyContract(_stakingStrategy);
        treasury.enforceIsSupportedToken(_payToken);

        // Recieve pay tokens
        uint256 payTokenAmount = treasury.usdAmountToToken(_mintAmount * price, _payToken);
        require(payTokenAmount <= _maxPayTokenAmount, "maxPayTokenAmount!");
        if (_payToken == address(0)) {
            require(msg.value >= payTokenAmount, "value < payTokenAmount");
            (bool success, ) = address(treasury).call{ value: payTokenAmount }("");
            require(success, "failed to send to treasury!");
            uint256 change = msg.value - payTokenAmount;
            if (change > 0) {
                (bool success, ) = msg.sender.call{ value: change }("");
                require(success, "failed to send change!");
            }
        } else {
            IERC20Metadata(_payToken).safeTransferFrom(
                msg.sender,
                _addressBook.treasury(),
                payTokenAmount
            );
        }

        for (uint256 i; i < _mintAmount; ++i) {
            // Mint item
            uint256 tokenId = nextTokenId++;
            tokenStakingStrategy[tokenId] = _stakingStrategy;
            _safeMint(msg.sender, tokenId);
            emit Mint(msg.sender, tokenId, _stakingStrategy, _payToken);
            // Enable staking
            IStakingStrategy(_stakingStrategy).stake(address(this), tokenId, _payload);
        }
    }

    // ------------------------------------------------------------------------------------
    // ----- PROTOCOL ACTIONS  ------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function burn(uint256 _tokenId) external {
        require(msg.sender == tokenStakingStrategy[_tokenId], "only staking strategy!");
        _burn(_tokenId);
    }

    // ------------------------------------------------------------------------------------
    // ----- PRODUCT OWNER ACTIONS  -------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function stopSell() external {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
        maxSupply = totalMintedAmount;
    }

    function setNewMaxSupply(uint256 _maxSupply) external {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
        require(_maxSupply > totalMintedAmount, "max supply less!");
        maxSupply = _maxSupply;
    }

    function setBaseUri(string calldata _uri) external {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
        uri = _uri;
    }

    // ------------------------------------------------------------------------------------
    // ----- INTERNAL  --------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function _baseURI() internal view override returns (string memory) {
        return uri;
    }
}
