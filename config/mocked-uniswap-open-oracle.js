
define("MockedOpenOracle", {
  contract: 'UniswapAnchoredView',
  properties: {
    price_data: { ref: 'OpenOraclePriceData' },
    reporter: 'address',
    anchor_period: 'number',
    anchor_tolerance: 'number',
    config: 'array'
  },
  build: async ({deploy, encode, keccak}, contract, {price_data, reporter, anchor_period, anchor_tolerance, config}) => {
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
        [uniswapMarket, isUniswapReversed] = [conf.uniswapMarket, conf.isUniswapReversed];
      } else {
        [uniswapMarket, isUniswapReversed] = [zeroAddress, false];
      }

      let symbolHash = keccak(conf.symbol);
      let priceSource = priceSourceEnum[conf.price_source];
      if (priceSource === undefined) {
        throw `Unknown price source: ${conf.price_source}`;
      }

      return [
        ...acc,
        {
          cToken: encode(conf.ctoken || zeroAddress),
          underlying: encode(conf.underlying || zeroAddress),
          symbolHash,
          baseUnit: '0x' + encode(conf.base_unit).toString(16),
          priceSource: '0x' + encode(priceSource),
          fixedPrice: '0x' + encode(conf.fixed_price || 0).toString(16),
          uniswapMarket: encode(uniswapMarket || zeroAddress),
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