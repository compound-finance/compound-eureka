
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

define("UniswapPair", {
  match: {
    properties: {
      mock: true
    }
  },
  contract: 'MockUniswapTokenPair',
  properties: {
    mock: 'bool',
    token0: { ref: 'ERC20' },
    token1: { ref: 'ERC20' },
    reserve0: 'number',
    reserve1: 'number',
    blockTimestampLast: 'number',
    priceCumulative0: 'number',
    priceCumulative1: 'number',
  },
  build: async ({deploy, encode, read}, contract, {token0, token1, reserve0, reserve1, blockTimestampLast, price0Cumulative, price1Cumulative}) => {
    let tokenSymbol0 = await read(token0, 'symbol(): string', []);
    let tokenSymbol1 = await read(token1, 'symbol(): string', []);

    console.log(`Creating mock Uniswap token pair for ${tokenSymbol0}-${tokenSymbol1}`);

    return await deploy(
      contract, [
        encode(reserve0),
        encode(reserve1),
        encode(blockTimestampLast),
        encode(price0Cumulative),
        encode(price1Cumulative)
      ]);
  }
});

define("UniswapPair", {
  contract: 'UniswapV2Pair',
  properties: {
    token0: { ref: 'ERC20' },
    token1: { ref: 'ERC20' },
    seeds: {
      dictionary: {
        key: 'ref',
        value: 'number'
      },
      setter: async ({bn, ethereum, read, show, trx}, pair, seeds) => {
        let changed = await Object.entries(seeds).reduce(async (accP, [ref, amt]) => {
          let acc = await accP;
          let pairBalance = await read(ref, 'balanceOf(address): uint256', [pair]);
          let senderBalance = await read(ref, 'balanceOf(address): uint256', [ethereum.from]);

          console.log({
            ref: show(ref),
            from: ethereum.from,
            pairBalance,
            senderBalance,
            amt
          });

          if (bn(amt).gt(bn(pairBalance))) {
            let diff = bn(amt).sub(bn(pairBalance));

            if (diff.gt(bn(senderBalance))) {
              throw new Error(`Wanted to seed with ${show(diff)} ${show(ref)} but my balance is only ${show(senderBalance)}`);
            }

            console.log(`Adding ${show(diff)} ${show(ref)} balance to ${show(pair)}`);
            await trx(ref, 'transfer(address,uint256)', [pair, diff]);

            return true;
          } else {
            return acc;
          }
        }, false);

        if (changed) {
          console.log("Minting liquidity...");

          await trx(pair, 'mint(address)', [ethereum.from]);
        } else {
          console.log("No change, not minting");
        }
      }
    }
  },
  build: async (actor, contract, {uniswap, seeds, token0, token1}, { definition }) => {
    let {encode, existing, read, trx} = actor;
    let tokenSymbol0 = await read(token0, 'symbol(): string', []);
    let tokenSymbol1 = await read(token1, 'symbol(): string', []);

    let pair = await read(uniswap, 'getPair(address,address): address', [token0, token1]);
    if (pair === '0x0000000000000000000000000000000000000000') {
      console.log(`Creating Uniswap Pair: ${tokenSymbol0} ${tokenSymbol1}`);
      await trx(uniswap, 'createPair(address,address)', [token0, token1]);

      pair = await read(uniswap, 'getPair(address,address): address', [token0, token1]);
    } else {
      console.log(`Using existing pair for ${tokenSymbol0} ${tokenSymbol1}`);
    }

    let deployed = existing(contract, pair);

    if (seeds) {
      console.log("Seeding market...");
      await definition.typeProperties.seeds.setter(actor, deployed, seeds);
    }

    return deployed;
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
    price_data: { ref: 'OpenOraclePriceData' },
    reporter: 'address',
    anchor_period: 'number',
    anchor_tolerance: 'number',
    config: 'array'
  },
  build: async ({deploy, deref, encode, keccak, read}, contract, {price_data, reporter, anchor_period, anchor_tolerance, config}) => {
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
        uniswapMarket = deref(conf.uniswapMarket).address;

        if (conf.isUniswapReversed === undefined) {
          isUniswapReversed = await read(conf.uniswapMarket, 'token0(): address', []) !== deref(conf.underlying).address;
        } else {
          isUniswapReversed = conf.isUniswapReversed;
        }
      } else {
        uniswapMarket = zeroAddress;
        isUniswapReversed = false;
      }

      console.log("uniswapMarket", conf.symbol, uniswapMarket, isUniswapReversed);

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
          uniswapMarket,
          isUniswapReversed
        }
      ];
    }, []);
    console.log({configs});

    async function deployRetry() {
      try {
        return await deploy(contract, {
          priceData_: price_data,
          reporter_: reporter,
          anchorPeriod_: anchor_period,
          anchorToleranceMantissa_: anchor_tolerance,
          configs
        });
      } catch (e) {
        if (e.message.includes('oversized')) {
          console.log(`Error ${e}, retrying...`);
          return await deployRetry();
        } else {
          throw e;
        }
      }
    }

    return await deployRetry();
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
