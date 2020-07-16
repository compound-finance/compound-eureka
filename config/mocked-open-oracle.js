// import AbiCoder from "web3-eth-abi";
// import Web3 from "web3";

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

  // TODO: Swap with ether's own implementation of this
  // e.g. findTypes("postPrices(bytes[],bytes[],string[])")-> ["bytes[]","bytes[]","string[]"]
    function findTypes(functionSig) {
  // this unexported function from ethereumjs-abi is copy pasted from source
  // see https://github.com/ethereumjs/ethereumjs-abi/blob/master/lib/index.js#L81
  let parseSignature = function (sig) {
    var tmp = /^(\w+)\((.*)\)$/.exec(sig) || [];

    if (tmp.length !== 3) {
      throw new Error('Invalid method signature')
    }

    var args = /^(.+)\):\((.+)$/.exec(tmp[2])

    if (args !== null && args.length === 3) {
      return {
        method: tmp[1],
        args: args[1].split(','),
        retargs: args[2].split(',')
      }
    } else {
      var params = tmp[2].split(',')
      if (params.length === 1 && params[0] === '') {
        // Special-case (possibly naive) fixup for functions that take no arguments.
        // TODO: special cases are always bad, but this makes the function return
        // match what the calling functions expect
        params = []
      }
      return {
        method: tmp[1],
        args: params
      }
    }
  }

  return parseSignature(functionSig).args;
    }

    function encodeFull(sig, args) {
      const types = findTypes(sig);
      const callData =
        AbiCoder.encodeFunctionSignature(sig) +
        AbiCoder.encodeParameters(types, args).slice(2);
      return [types, callData];
    }

    function encode(sig, args) {
      let [types, callData] = encodeFull(sig, args);
      return callData;
    }

    async function read(address, sig, args, returns, web3) {
      let [types, callData] = encodeFull(sig, args);
      const call = {
        data: callData,
        // Price open oracle data
        to: address
      };
      try {
        const result = await web3.eth.call(call);
        return AbiCoder.decodeParameter(returns, result);
      } catch (e) {
        console.error(`Error reading ${sig}:${args} at ${address}: ${e.toString()}`);
        throw e;
      }
    }

    async function getReserves(pairAddress, web3) {
      return await read(
        pairAddress,
        "getReserves()",
        [],
        ["uint112","uint112","uint32"],
        web3
      );
    }

    async function getCumulativePrices(pairAddress, web3) {
      const price0 = await read(
        pairAddress,
        'price0CumulativeLast()',
        [],
        ['uint256'],
        web3
      );
      const price1 = await read(
        pairAddress,
        'price1CumulativeLast()',
        [],
        ['uint256'],
        web3
      );

      return [price0[0], price1[0]];
    }

    const mainnetPairs = {
      ETH: "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc",
      BTC: "0xbb2b8038a1640196fbe3e38816f3e67cba72d940",
      DAI: "0xa478c2975ab1ea89e8196811f51a7b7ade33eb11",
      REP: "0x8bd1661da98ebdd3bd080f0be4e6d9be8ce9858c",
      BAT: "0xb6909b960dbbe7392d405429eb2b3649752b4838",
      ZRX: "0xc6f348dd3b91a56d117ec0071c1e9b83c0996de4",
      LINK: "0xa2107fa5b38d9bbd2c461d6edf11b11a50f6b974",
      COMP: "0xcffdded873554f362ac02f8fb1f02e5ada10516f",
      KNC: "0xf49c43ae0faf37217bdcb00df478cf793edd6687"
    }
    let priceSourceEnum = {
      "FIXED_ETH": 0,
      "FIXED_USD": 1,
      "REPORTER": 2
    };

    const mainnetWeb3 = new Web3(new Web3.providers.HttpProvider('https://mainnet.infura.io/v3/a9f65788c3c4481da5f6f6820d4cf5c0'));
    let configs = await config.reduce(async (accP, conf) => {
      let acc = await accP; // force ordering
      let token0;
      let token1;
      if (conf.price_source === 'REPORTER') {
        const reserves = await getReserves(mainnetPairs[conf.symbol], mainnetWeb3);
        const priceCumulatives = await getCumulativePrices(mainnetPairs[conf.symbol], mainnetWeb3);
        if (conf.symbol === 'ETH') {
          [token0, token1] = [weth, usdc];
        } else {
          [token0, token1] = [conf.underlying, weth];
        }
        console.log(`For symbol ${conf.symbol}, mainnet token pair = ${mainnetPairs[conf.symbol]} and values are \
        reserve0 = ${reserves[0]}, reserve1 = ${reserves[1]}, blockTimestampLast = ${reserves[2]}, \
        price0Cumulative = ${priceCumulatives[0]}, price1Cumlative = ${priceCumulatives[1]}`);

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
            reserve0: '0x' + encode(reserves[0]),
            reserve1: '0x' + encode(reserves[1]),
            blockTimestampLast: '0x' + encode(reserves[2]),
            price0CumulativeLast: '0x' + encode(priceCumulatives[0]),
            price1CumulativeLast: '0x' + encode(priceCumulatives[1])
          }
        ];
      } else {
        return acc;
      }
    }, []);
    // console.log({configs});
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

