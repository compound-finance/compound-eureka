


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
    price_data: { ref: 'OpenOraclePriceData' },
    reporter: 'address',
    anchor_period: 'number',
    anchor_tolerance: 'number',
    config: 'array'
  },
  build: async ({bn, deploy, encode, keccak, read, trx}, contract, {price_data, reporter, anchor_period, anchor_tolerance, config}) => {
    let priceSourceEnum = {
      "FIXED_ETH": 0,
      "FIXED_USD": 1,
      "REPORTER": 2
    };

    let zeroAddress = '0x0000000000000000000000000000000000000000';

    let configs = await config.reduce(async (accP, conf) => {
      let acc = await accP; // force ordering
      let uniswapMarket;
      let isUniswapReversed;
      if (conf.price_source === 'REPORTER') {
        [uniswapMarket, isUniswapReversed] = [config.uniswapMarket, config.isUniswapReversed];
      } else {
        [uniswapMarket, isUniswapReversed] = [zeroAddress, false];
      }

      let symbolHash = keccak(conf.symbol);
      let priceSource = priceSourceEnum[conf.price_source];
      if (priceSource === undefined) {
        throw `Unknown price source: ${conf.price_source}`;
      }

      // TODO: Fix encoding issues here
      console.log("base units = ", '0x' + encode(conf.base_unit));
      return [
        ...acc,
        {
          cToken: encode(conf.cToken || zeroAddress),
          underlying: encode(conf.underlying || zeroAddress),
          symbolHash,
          baseUnit: '0x' + encode(conf.base_unit).toString(16),
          priceSource: '0x' + encode(priceSource),
          fixedPrice: '0x' + encode(conf.fixed_price || 0).toString(16),
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
