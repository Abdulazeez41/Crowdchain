require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config();

const COMPILER_SETTINGS = {
  evmVersion: "cancun",
  optimizer: {
    enabled: true,
    runs: 1_000_000,
  },
};

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.28",
        settings: COMPILER_SETTINGS,
      },
      {
        version: "0.8.9",
        settings: COMPILER_SETTINGS,
      },
    ],
  },
  networks: {
    baseSepolia: {
      url: "https://sepolia.base.org",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 84532,
    },
  },
  etherscan: {
    apiKey: {
      baseSepolia: process.env.BASESCAN_API_KEY,
    },
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    cache: "./cache",
    tests: "./test",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 20000,
  },
};
