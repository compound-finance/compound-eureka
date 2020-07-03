
// Currently, we can only use an existing factory
define("Uniswap", {
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
    return await deploy(contract, {});
  }
});

define("OpenOracle", {
  properties: {
    uniswap: { ref: 'Uniswap' },
    price_data: { ref: 'OpenOraclePriceData' },
    reporter: 'address',
    anchor_period: 'number',
    anchor_tolerance: 'number',
    config: 'array'
  },
  build: async ({deploy, keccak}, contract, {uniswap, price_data, reporter, anchor_period, anchor_tolerance, config}) => {
    console.log({uniswap, price_data, reporter, anchor_period, anchor_tolerance, config});
    throw "abc";
    // TODO: I think we need WETH address
    let weth = null;

    let priceSourceEnum = {
      "REPORTER": 0,
      "FIXED_USD": 1,
      "FIXED_ETH": 2
    };

    let configs = await Promise.all(configs.map(async (config) => {
      let uniswapPair = await uniswap.getPair(config.underlying, weth);
      // TODO: Handle ETH
      // TODO: Check if 0

      let isUniswapReversed = false; // TODO
      let symbolHash = keccak(config.symbol);
      let priceSource = priceSourceEnum[config.price_source];
      if (priceSource === undefined) {
        throw `Unknown price source: ${config.price_source}`;
      }

      return {
        uniswapPair,
        isUniswapReversed,
        symbolHash,
        priceSource,
        baseUnit: config.base_unit,
        underlying: config.underlying,
        cTokenAddress: config.cToken,
        fixedPrice: config.fixed_price
      };
    }));
    console.log(configs);
    throw `def`;

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