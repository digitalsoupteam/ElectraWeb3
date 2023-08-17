// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

interface IItem {
    function initialize(
        address _governance,
        string calldata _name,
        string calldata _symbol,
        uint256 _price,
        uint256 _maxSupply
    ) external;

    function burn(uint256 _tokenId) external;

    function price() external view returns (uint256);

    function maxSupply() external returns (uint256);

    function totalMintedAmount() external returns (uint256);

    function amountInToken(uint256 _tokenId) external returns (uint256);

    function tokenStakingStrategy(uint256 _tokenId) external returns (address);

    function mint(uint256 _amount, address _stakingStrategy, address _payToken, bytes memory _payload) external;

    function tokenPrice(uint256 _tokenId) external view returns (uint256);

    function stopSell() external;

    function setNewMaxSupply(uint256 _maxSupply) external;
}
