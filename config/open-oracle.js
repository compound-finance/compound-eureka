
// Currently, we can only use an existing Uniswap factory
define("Uniswap", {
  contract: 'UniswapV2Factory',
  properties: {
    address: 'address',
    block: {
      type: 'number',
      setter: async ({trx}, contract, block) => {}
    }
  },
  build: async ({existing}, contract, { address }) => {
    return existing(contract, address);
  }
});

// Currently, we can only use an existing WETH
define("WETH", {
  contract: 'WETH9_',
  properties: {
    address: 'address',
    block: {
      type: 'number',
      setter: async ({trx}, contract, block) => {}
    }
  },
  build: async ({existing}, contract, { address }) => {
    return existing(contract, address);
  }
});

define("OpenOraclePriceData", {
  properties: {},
  build: async ({deploy}, contract, {}) => {
    return await deploy(contract, []);
  }
});

define("OpenOracle", {
  contract: 'UniswapAnchoredView',
  properties: {
    uniswap: { ref: 'Uniswap' },
    weth: { ref: 'WETH' },
    usdc: { ref: 'Erc20' },
    price_data: { ref: 'OpenOraclePriceData' },
    reporter: 'address',
    anchor_period: 'number',
    anchor_tolerance: 'number',
    config: 'array'
  },
  build: async ({bn, deploy, encode, keccak, read, trx}, contract, {uniswap, weth, usdc, price_data, reporter, anchor_period, anchor_tolerance, config}) => {
    let priceSourceEnum = {
      "FIXED_ETH": 0,
      "FIXED_USD": 1,
      "REPORTER": 2
    };

    let zeroAddress = '0x0000000000000000000000000000000000000000';

    async function getOrCreatePair(asset0, asset1, allowCreate=true) {
      let pair = await read(uniswap, 'getPair(address,address): address', [asset0, asset1]);
      if (pair === zeroAddress) {
        if (allowCreate) {
          console.log(`Creating Uniswap Pair: ${asset0} ${asset1}`);
          await trx(uniswap, 'createPair(address,address)', [asset0, asset1]);
          // TODO: We need to fund liquidity for the pair as well
          return await getOrCreatePair(asset0, asset1, false);
        } else {
          throw new Error(`Could not find Uniswap pair ${asset0} ${asset1}`);
        }
      } else {
        let reversed = bn(asset0).lt(bn(asset1)); // TODO: Check
        return [ pair, reversed ];
      }
    }

    let configs = await config.reduce(async (accP, conf) => {
      let acc = await accP; // force ordering
      let uniswapMarket;
      let isUniswapReversed;
      if (conf.price_source === 'REPORTER') {
        if (conf.symbol === 'ETH') {
          [uniswapMarket, isUniswapReversed] = await getOrCreatePair(weth, usdc);
        } else {
          [uniswapMarket, isUniswapReversed] = await getOrCreatePair(conf.underlying, weth); // TODO: Check asset order
        }
      } else {
        [uniswapMarket, isUniswapReversed] = [zeroAddress, false];
      }

      console.log("uniswapMarket", conf.symbol, uniswapMarket, isUniswapReversed);

      let symbolHash = keccak(conf.symbol);
      let priceSource = priceSourceEnum[conf.price_source];
      if (priceSource === undefined) {
        throw `Unknown price source: ${conf.price_source}`;
      }

      // TODO: Fix encoding issues here
      return [
        ...acc,
        {
          cToken: encode(conf.cToken || zeroAddress),
          underlying: encode(conf.underlying || zeroAddress),
          symbolHash,
          baseUnit: '0x' + encode(conf.base_unit),
          priceSource: '0x' + encode(priceSource),
          fixedPrice: '0x' + encode(conf.fixed_price || 0),
          uniswapMarket,
          isUniswapReversed
        }
      ];
    }, []);
    console.log({configs});

    return await deploy(contract, {
      priceData_: price_data,
      reporter_: reporter,
      anchorPeriod_: anchor_period,
      anchorToleranceMantissa_: anchor_tolerance,
      configs
    });
  }
});


// This is our old oracle, for posterity
if (network !== 'mainnet') { // Skip these contracts on prod
  define("SimplePriceOracle", {
    properties: {
      prices: {
        deferred: true,
        dictionary: {
          key: 'ref',
          value: 'number'
        },
        setter: async ({bn, read, trx}, oracle, prices) => {
          return await Object.entries(prices).reduce(async (acc_, [asset, price_]) => {
            let acc = await acc_;
            let price = bn(price_);
            let currentPrice = bn(await read(oracle, 'assetPrices', [asset]));

            if (currentPrice.eq(price)) {
              console.log(`Price of ${asset} currently equal to expected price of ${price.toString()}`);
            } else {
              console.log(`Setting price of ${asset} from ${currentPrice.toString()} to ${price.toString()}`);
              return await trx(oracle, 'setDirectPrice', [asset, price]);
            }
          }, Promise.resolve(null));
        }
      }
    },
    build: async (actor, contract, {prices}, { definition }) => {
      let {deploy} = actor;
      let deployed = await deploy(contract);

      if (prices) {
        console.log("Setting underlying prices...");
        await definition.typeProperties.prices.setter(actor, deployed, prices);
      }

      return deployed;
    }
  });
}
