// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

interface IUUPSUpgradeable {
   function upgradeTo(address newImplementation) external;
}
