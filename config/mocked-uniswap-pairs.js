
define("ETH_USDC", {
    contract: 'MockUniswapTokenPair',
    build: async ({deploy, encode}, contract, {}) => {
      const initialValue = '0x' + encode(0).toString(16);
      console.log("Creating mocked uniswap token pair for ETH_USDC");
      return await deploy(contract, [initialValue, initialValue, initialValue, initialValue, initialValue]);
    }
});

define("WBTC_ETH", {
  contract: 'MockUniswapTokenPair',
  build: async ({deploy, encode}, contract, {}) => {
    const initialValue = '0x' + encode(0).toString(16);
    console.log("Creating mocked uniswap token pair for WBTC_ETH");
    return await deploy(contract, [initialValue, initialValue, initialValue, initialValue, initialValue]);
  }
});

define("REP_ETH", {
  contract: 'MockUniswapTokenPair',
  build: async ({deploy, encode}, contract, {}) => {
    const initialValue = '0x' + encode(0).toString(16);
    console.log("Creating mocked uniswap token pair for REP_ETH");
    return await deploy(contract, [initialValue, initialValue, initialValue, initialValue, initialValue]);
  }
});

define("BAT_ETH", {
  contract: 'MockUniswapTokenPair',
  build: async ({deploy, encode}, contract, {}) => {
    const initialValue = '0x' + encode(0).toString(16);
    console.log("Creating mocked uniswap token pair for BAT_ETH");
    return await deploy(contract, [initialValue, initialValue, initialValue, initialValue, initialValue]);
  }
});

define("DAI_ETH", {
  contract: 'MockUniswapTokenPair',
  build: async ({deploy, encode}, contract, {}) => {
    const initialValue = '0x' + encode(0).toString(16);
    console.log("Creating mocked uniswap token pair for DAI_ETH");
    return await deploy(contract, [initialValue, initialValue, initialValue, initialValue, initialValue]);
  }
});

define("ETH_ZRX", {
  contract: 'MockUniswapTokenPair',
  build: async ({deploy, encode}, contract, {}) => {
    const initialValue = '0x' + encode(0).toString(16);
    console.log("Creating mocked uniswap token pair for ETH_ZRX");
    return await deploy(contract, [initialValue, initialValue, initialValue, initialValue, initialValue]);
  }
});

define("ETH_KNC", {
  contract: 'MockUniswapTokenPair',
  build: async ({deploy, encode}, contract, {}) => {
    const initialValue = '0x' + encode(0).toString(16);
    console.log("Creating mocked uniswap token pair for ETH_KNC");
    return await deploy(contract, [initialValue, initialValue, initialValue, initialValue, initialValue]);
  }
});

define("LINK_ETH", {
  contract: 'MockUniswapTokenPair',
  build: async ({deploy, encode}, contract, {}) => {
    const initialValue = '0x' + encode(0).toString(16);
    console.log("Creating mocked uniswap token pair for ETH_ZRX");
    return await deploy(contract, [initialValue, initialValue, initialValue, initialValue, initialValue]);
  }
});

define("COMP_ETH", {
  contract: 'MockUniswapTokenPair',
  build: async ({deploy, encode}, contract, {}) => {
    const initialValue = '0x' + encode(0).toString(16);
    console.log("Creating mocked uniswap token pair for COMP_ETH");
    return await deploy(contract, [initialValue, initialValue, initialValue, initialValue, initialValue]);
  }
});
