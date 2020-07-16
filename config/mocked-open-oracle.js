

define("Uniswap", {
  match: {
    properties: {
      type: 'mock'
    }
  },
  contract: 'MockUniswapV2Factory',
  properties: {
    weth: { ref: 'WETH' },
    usdc: { ref: 'Erc20' },
    config: 'array'
  },
  build: async ({deploy, encode}, contract, {weth, usdc, config}) => {
    let priceSourceEnum = {
      "FIXED_ETH": 0,
      "FIXED_USD": 1,
      "REPORTER": 2
    };

    let configs = await config.reduce(async (accP, conf) => {
      let acc = await accP; // force ordering
      let token0;
      let token1;
      if (conf.price_source === 'REPORTER') {
        if (conf.symbol === 'ETH') {
          [token0, token1] = [weth, usdc];
        } else {
          [token0, token1] = [conf.underlying, weth];
        }

        let priceSource = priceSourceEnum[conf.price_source];
        if (priceSource === undefined) {
          throw `Unknown price source: ${conf.price_source}`;
        }

        return [
          ...acc,
          {
            token0: encode(token0),
            token1: encode(token1),
            priceSource: '0x' + encode(priceSource),
          }
        ];
      } else {
        return acc;
      }
    }, []);
    console.log({configs});
    return await deploy(contract, [configs]);
  }
});


define('WETH', {
  match: {
    properties: {
      type: 'weth'
    }
  },
  contract: 'WETH9_',
  properties: {
    type: 'string', // TODO: I'd like to remove `type` as a listed property
    balances: {
      deferred: true,
      dictionary: {
        key: 'ref',
        value: 'number'
      },
      setter: async () => null
    },
    name: { // TODO: We may want to verify these are correct, or hook this into a getter system
      type: 'string',
      default: 'Wrapped Ether',
      setter: async () => null
    },
    symbol: {
      type: 'string',
      default: 'WETH',
      setter: async () => null
    },
    decimals: {
      type: 'string',
      default: { type: 'number', base: '18', exp: 0 },
      setter: async () => null
    }
  },
  build: async (actor, contract, {balances}, { definition }) => {
    let {deploy} = actor;
    // TODO: This isn't verifying, but the contract is matching existing, so it's hard to test
    let deployed = await deploy(contract, [], {verify: false});
    if (balances) {
      console.log(`Setting token balances for ${contract}...`);
      await definition.typeProperties.balances.setter(actor, deployed, balances);
    }
    return deployed;
  }
});

