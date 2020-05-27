
// trx: Send web3
// existing: Return "contract" from address, contract
// read: Read web3 data
// deploy: Deploys a contract

// Set a backend to store our known state
backend({
  file: `../state/${network}-state.json`
});

// Set a provider to use to talk to an Ethereum node
// TODO: Handle other networks here
let defaultProvider = () =>
  network === 'development' ? 'http://localhost:8545'
    : `https://${network}-eth.compound.finance`;

let defaultPk = () =>
  network === 'development' ? { unlocked: 0 }
    : { pk: fs.readFileSync(path.join(os.homedir(), '.ethereum', network), 'utf8') };

provider(env('provider', defaultProvider), {
  sendOpts: {
    from: env('pk', defaultPk),
    gas: 6000000,
    gasPrice: 100000
  },
  verificationOpts: network !== 'development' && env('etherscan') ? {
    verify: true,
    etherscanApiKey: env('etherscan'),
    raiseOnError: true
  } : {}
});

async function gov(actor, contract, func, args, opts={}) {
  let {read, encodeFunctionData, ethereum, show, trx} = actor;
  let admin = await read(contract, 'admin(): address', [], opts); // TODO: Pass through opts?
  if (admin == ethereum.from) {
    return await compoundTrx(actor, contract, func, args, opts);
  } else {
    // Okay, we're going to propose through the governor
    let proposeSig = 'propose(address[] memory targets, uint[] memory values, string[] memory signatures, bytes[] memory calldatas, string memory description)';
    let description = `Gov ${func} ${show(args)}`;
    let data = '0x' + encodeFunctionData(func, args);
    let proposalTrx = await trx('#gov', proposeSig, [[contract], [0], [func], [data], description]);
    console.log(`Created proposal ${description}`);
    return proposalTrx;
  }
}

async function compoundTrx({events, trx}, contract, func, args, opts={}) {
  let receipt = await trx(contract, func, args, opts);
  let receiptEvents = {};
  if (!func.includes('(') || opts.proxy) { // Short hand to see if we're using a spelled out ABI
    receiptEvents = events(opts.proxy ? { proxy: opts.proxy } : contract, receipt);
  }
  if (receiptEvents.hasOwnProperty('Failure')) {
    throw new Error(`Failed to execute Compound transaction, got failure: ${JSON.stringify(receiptEvents['Failure'])}`);
  }

  return receipt;
}

// Define our contract configuration
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

define('InterestRateModel', {
  match: {
    properties: {
      type: 'linear'
    }
  },
  contract: 'WhitePaperInterestRateModel',
  properties: {
    type: 'string',
    base: 'number',
    slope: 'number'
  },
  build: ({deploy}, contract, {base, slope}) =>
    deploy(contract, {
      baseRatePerYear: base,
      multiplierPerYear: slope
    })
});

define('InterestRateModel', {
  match: {
    properties: {
      type: 'jump'
    }
  },
  contract: 'JumpRateModel',
  properties: {
    type: 'string',
    base: 'number',
    slope: 'number',
    jump: 'number',
    kink: 'number'
  },
  build: ({deploy}, contract, {base, slope, jump, kink}) =>
    deploy(contract, {
      baseRatePerYear: base,
      multiplierPerYear: slope,
      jumpMultiplierPerYear: jump,
      kink_: kink
    })
});

define('CErc20Delegate', {
  contract: 'CErc20Delegate',
  build: async ({deploy}, contract, props) => deploy(contract)
});

define('CToken', {
  match: {
    properties: {
      type: 'immutable'
    }
  },
  contract: 'CErc20Immutable',
  properties: {
    type: 'string',
    symbol: 'string',
    name: 'string',
    admin: 'address',
    underlying: { ref: 'Erc20' },
    comptroller: { ref: 'Unitroller' },
    decimals: { type: 'number', default: 8 },
    initial_exchange_rate: { type: 'number', default: 0.2e10 }, // TODO: Figure out default here
    interest_rate_model: {
      ref: 'InterestRateModel',
      setter: async (actor, cToken, newInterestRateModel) => {
        return await gov(actor, cToken, '_setInterestRateModel(address)', [newInterestRateModel]);
      }
    }
  },
  build: async ({deploy}, contract, { symbol, name, decimals, admin, underlying, comptroller, interest_rate_model, initial_exchange_rate }) => {
    return await deploy(contract, {
      underlying_: underlying,
      comptroller_: comptroller,
      interestRateModel_: interest_rate_model,
      initialExchangeRateMantissa_: initial_exchange_rate,
      name_: name,
      symbol_: symbol,
      decimals_: decimals,
      admin_: admin
    });
  }
});

define('CToken', {
  match: {
    properties: {
      type: 'delegator'
    }
  },
  contract: 'CErc20Delegator',
  properties: {
    type: 'string',
    symbol: 'string',
    name: 'string',
    admin: 'address',
    underlying: { ref: 'Erc20' },
    comptroller: { ref: 'Unitroller' },
    decimals: { type: 'number', default: 8 },
    delegate: { ref: 'CErc20Delegate' },
    become_implementation_data: { type: 'string', default: '0x' }, // TODO: 'bytes'?
    initial_exchange_rate: { type: 'number', default: 0.2e10 }, // TODO: Figure out default here
    interest_rate_model: {
      ref: 'InterestRateModel',
      setter: async (actor, cToken, newInterestRateModel) => {
        return await gov(actor, cToken, '_setInterestRateModel(address)', [newInterestRateModel]);
      }
    }
  },
  build: async ({deploy}, contract, { symbol, name, decimals, admin, underlying, comptroller, interest_rate_model, initial_exchange_rate, delegate, become_implementation_data }) => {
    return await deploy(contract, {
      underlying_: underlying,
      comptroller_: comptroller,
      interestRateModel_: interest_rate_model,
      initialExchangeRateMantissa_: initial_exchange_rate,
      name_: name,
      symbol_: symbol,
      decimals_: decimals,
      admin_: admin,
      implementation_: delegate,
      becomeImplementationData: become_implementation_data,
    });
  }
});

define('CToken', {
  match: {
    properties: {
      type: 'cether'
    }
  },
  contract: 'CEther',
  properties: {
    type: 'string',
    symbol: 'string',
    name: 'string',
    admin: 'address',
    comptroller: { ref: 'Unitroller' },
    decimals: { type: 'number', default: 8 },
    initial_exchange_rate: { type: 'number', default: 0.2e10 }, // TODO: Figure out default here
    interest_rate_model: {
      ref: 'InterestRateModel',
      setter: async (actor, cEther, newInterestRateModel) => {
        return await gov(actor, cETher, '_setInterestRateModel(address)', [newInterestRateModel]);
      }
    }
  },
  build: async ({deploy}, contract, { symbol, name, admin, comptroller, interest_rate_model, decimals, initial_exchange_rate }) => {
    return await deploy(contract, {
      comptroller_: comptroller,
      interestRateModel_: interest_rate_model,
      initialExchangeRateMantissa_: initial_exchange_rate,
      name_: name,
      symbol_: symbol,
      decimals_: decimals,
      admin_: admin
    });
  }
});

define('Maximillion', {
  properties: {
    cEther: { ref: 'CToken' }
  },
  build: async ({deploy}, contract, { cEther }) => deploy(contract, [cEther])
});

define("Comptroller", {
  build: async ({deploy}, contract, props) => deploy(contract)
});

define("Unitroller", {
  properties: {
    oracle: {
      ref: 'PriceOracle',
      setter: async (actor, unitroller, oracle) => {
        await gov(actor, unitroller, '_setPriceOracle(address)', [oracle], { proxy: 'Comptroller' });
      }
    },
    max_assets: {
      ref: 'Comptroller',
      setter: async (actor, unitroller, comptroller, { max_assets }) => {
        await gov(actor, unitroller, '_setMaxAssets(uint newMaxAssets)', [max_assets]);
      }
    },
    close_factor: {
      ref: 'Comptroller',
      deferred: true,
      setter: async (actor, unitroller, comptroller, { close_factor }) => {
        await gov(actor, unitroller, '_setCloseFactor(uint newCloseFactorMantissa)', [close_factor]);
      }
    },
    implementation: {
      ref: 'Comptroller',
      setter: async (actor, unitroller, comptroller) => {
        await gov(actor, unitroller, '_setPendingImplementation(address)', [comptroller]);
        await gov(actor, comptroller, '_become(address unitroller)', { unitroller });
      }
    },
    supported_markets: {
      type: 'array',
      deferred: true,
      order: 1,
      setter: async (actor, unitroller, markets, { properties }) => {
        let {events, read, show} = actor;
        return await markets.reduce(async (acc, market) => {
          await acc; // Force ordering

          // TODO: Better handle proxy
          let marketData = await read(unitroller, 'markets', [market], { proxy: 'Comptroller' });

          if (!marketData.isListed) {
            return await gov(actor, unitroller, '_supportMarket(address)', [market]);
          } else {
            console.log(`Market ${show(market)} already listed`);
          }
        });
      }
    },
    collateral_factors: {
      order: 2,
      dictionary: {
        key: 'ref',
        value: 'number'
      },
      deferred: true,
      setter: async (actor, unitroller, collateralFactors) => {
        let {read, show, trx, bn} = actor;
        return await Object.entries(collateralFactors).reduce(async (acc, [market, collateralFactor]) => {
          await acc; // Force ordering

          // TODO: Better handle proxy
          let marketData = await read(unitroller, 'markets', [market], { proxy: 'Comptroller' });

          // TODO: How do we compare these numbers? These base/exp numbers are getting in the way of being helpful...
          // Since now we really have 3-4 ways to represent numbers

          let current = bn(marketData.collateralFactorMantissa);
          let expected = bn(collateralFactor);
          if (!current.eq(expected)) {
            return await gov(actor, unitroller, '_setCollateralFactor(address,uint)', [market, expected], { proxy: 'Comptroller' });
          } else {
            console.log(`Market ${show(market)} already has correct collateral factor`);
          }
        });
      }
    },
    admin: {
      type: 'address',
      deferred: true,
      setter: async (actor, unitroller, newAdmin) => {
        let {trx, events, show} = actor;
        // Admin must be accepted
        let _setPendingAdmin = await gov(actor, unitroller, '_setPendingAdmin(address)', [newAdmin]);
        // TODO: Should this be gov, too?
        let _acceptAdmin = await trx(newAdmin, 'harnessAcceptAdmin(address unitroller)', [unitroller]);
      }
    }
  },
  build: async (actor, contract, properties, { definition }) => {
    let {implementation, oracle, supported_markets, collateral_factors, max_assets, close_factor, admin} = properties;
    let deployed = await actor.deploy(contract);

    // We can't set these properties in the constructor, so they'll
    // need to be set by calling the setters directly
    if (implementation) {
      console.log("Setting implementation...");
      await definition.typeProperties.implementation.setter(actor, deployed, implementation, properties);
    }

    if (oracle) {
      console.log("Setting oracle...");
      await definition.typeProperties.oracle.setter(actor, deployed, oracle, properties);
    }

    if (supported_markets) {
      console.log("Supporting markets...");
      await definition.typeProperties.supported_markets.setter(actor, deployed, supported_markets, properties);
    }

    if (collateral_factors) {
      console.log("Setting collateral factors...");
      await definition.typeProperties.collateral_factors.setter(actor, deployed, collateral_factors, properties);
    }

    if (max_assets) {
      console.log("Setting max assets...");
      await definition.typeProperties.max_assets.setter(actor, deployed, max_assets, properties);
    }

    if (close_factor) {
      console.log("Setting close factor...");
      await definition.typeProperties.close_factor.setter(actor, deployed, close_factor, properties);
    }

    if (admin) {
      console.log("Setting admin...");
      await definition.typeProperties.admin.setter(actor, deployed, admin, properties);
    }

    return deployed;
  }
});

define("CompoundLens", {
  build: async ({deploy}, contract, props) => deploy(contract)
});

define("Fauceteer", {
  build: async ({deploy}, contract, props) => deploy(contract)
});
