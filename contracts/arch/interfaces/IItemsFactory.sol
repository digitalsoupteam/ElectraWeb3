// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

interface IItemsFactory {
    function enforseIsSupportedItem(uint256 _item) external view;

    function prices(uint256 _item) external view returns (uint256);

    function newItems(uint256[] memory _ids, uint256[] memory _amounts) external returns (uint256);

    function totalPrice(
        uint256[] memory _ids,
        uint256[] memory _amounts
    ) external view returns (uint256 totalPrice_);

    function addItem(string calldata _name, uint256 _price) external;

    function stopItemSell(uint256 _itemId) external;
}
