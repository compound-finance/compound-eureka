
// trx: Send web3
// existing: Return "contract" from address, contract
// read: Read web3 data
// deploy: Deploys a contract

// Set a backend to store our known state
backend({
  file: `./${network}-state.json`
});

// Set a provider to use to talk to an Ethereum node
// TODO: Handle other networks here
provider(env('provider', 'http://localhost:8545'), {
  sendOpts: {
    from: env('pk') ? { pk: env('pk') } : { unlocked: 0 },
    gas: 6000000
  },
  verificationOpts: network !== 'development' && env('etherscan') ? {
    verify: true,
    etherscanApiKey: env('etherscan'),
    raiseOnError: true
  } : {}
});

// Define our contract configuration
if (network !== 'mainnet') {
  // Make sure we don't even define this on prod
  define("SimplePriceOracle", {
    properties: {
      prices: {
        deferred: true,
        dictionary: {
          key: 'ref',
          value: 'number'
        },
        setter: async ({trx}, oracle, prices) => {
          // TODO: Mutate prices as needed, versus always updating all of 'em
          return Promise.all(Object.entries(prices).map(([address, price]) => {
            return trx(oracle, 'setPrice', [address, price]);
          }));
        },
        getter: async (contract, props) => {
          // TODO: How do we iterate over known keys?
        }
      }
    },
    build: async ({deploy}, contract, props) => deploy(contract)
  });
}

define('InterestRateModel', {
  match: {
    type: 'jump-rate-model'
  },
  contract: 'JumpRateModel',
  properties: {
    base_rate: 'number',
    multiplier: 'number',
    jump_multiplier: 'number',
    kink: 'number'
  },
  build: ({deploy}, contract, {base_rate, multiplier, jump_multiplier, kink}) =>
    deploy(contract, {
      baseRatePerYear: base_rate,
      multiplierPerYear: multiplier,
      jumpMultiplierPerYear: jump_multiplier,
      kink_: kink
    })
});

// Existing Erc20 -- So what we're trying to accomplish here is, you
// can make the contract as an import, but we didn't want to say it...
// maybe we should just say it? But if we're going to import, we should
// probably make this better than just okay? Specifically, there's really
// three types of imports

// 1. We have a remote contract with foreign code (e.g. `import USDT`)
//   -> We might want to import the build, the definition and the config
// 2. We have a remote contract with known code that matches our definitions
//   -> We might want to import just the config. We should also check the deployed code against the config.
// 3. We have a remote contract with known code that doesn't match our definitions
//   -> We might want to import the build and the definition, and still may want to check against the build.

// So that looks like there's linear steps:
// 1. Maybe  Import build
// 2. Maybe  Import definition
// 3. Always Import config


// Note: this probably should _pull_ properties
define('Erc20', {
  match: {
    has_properties: ['address']
  },
  contract: 'Erc20',
  properties: {
    address: 'string',
    name: {
      type: 'string',
      getter: ({read}, contract, props) => read(contract, 'name')
    },
    symbol: {
      type: 'string',
      getter: ({read}, contract, props) => read(contract, 'symbol')
    }
  },
  build: async ({existing}, contract, props) => existing(contract, props.address)
});

// Make a new faucet token
define('Erc20', {
  match: {
    default: true
  },
  contract: 'FaucetToken',
  properties: {
    name: 'string',
    symbol: 'string',
    initial_amount: { type: 'number', default: 10e10 },
    decimals: { type: 'number', default: 18 }
  },
  build: async ({deploy, console}, contract, {name, symbol, initial_amount, decimals}) => {
    return deploy(contract, [initial_amount, name, decimals, symbol]);
  }
});

define('CErc20Delegate', {
  contract: 'CErc20Delegate',
  build: async ({deploy}, contract, props) => deploy(contract)
});

define('CToken', {
  match: {
    properties: {
      type: 'erc20-delegator'
    },
    default: true
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
      setter: async ({trx}, cToken, newInterestRateModel) => {
        return await trx(cToken, '_setInterestRateModel', [newInterestRateModel]);
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
      type: 'ceth'
    },
    default: true
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
      setter: async ({trx}, cEther, newInterestRateModel) => {
        return await trx(cETher, '_setInterestRateModel', [newInterestRateModel]);
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

define("Comptroller", {
  build: async ({deploy}, contract, props) => deploy(contract)
});

define("Unitroller", {
  properties: {
    oracle: {
      ref: 'PriceOracle',
      deferred: true,
      setter: async ({trx}, unitroller, oracle) => {
        await trx(unitroller, '_setPriceOracle', [oracle], { proxy: 'Comptroller' });
      }
    },
    implementation: {
      ref: 'Comptroller',
      deferred: true,
      setter: async ({trx}, unitroller, comptroller) => {
        await trx(unitroller, '_setPendingImplementation', [comptroller]);
        await trx(comptroller, '_become', [unitroller]);
      }
    },
    supported_markets: {
      type: 'array',
      deferred: true,
      setter: async ({read, show, trx}, unitroller, markets, { properties }) => {
        return await markets.reduce(async (acc, market) => {
          await acc; // Force ordering
          
          // TODO: Better handle proxy
          let marketData = await read(unitroller, 'markets', [market], { proxy: 'Comptroller' });

          if (!marketData.isListed) {
            return await trx(unitroller, '_supportMarket', [market], { proxy: 'Comptroller' });
          } else {
            console.log(`Market ${show(market)} already listed`);
          }
        });
      }
    }
  },
  build: async (actor, contract, {implementation, oracle, supported_markets}, { definition }) => {
    let deployed = await actor.deploy(contract);

    // We can't set these properties in the constructor, so they'll
    // need to be set by calling the setters directly
    if (implementation) {
      console.log("Setting implementation...");
      await definition.typeProperties.implementation.setter(actor, deployed, implementation);
    }

    if (supported_markets) {
      console.log("Supporting markets...");
      await definition.typeProperties.supported_markets.setter(actor, deployed, supported_markets);
    }

    if (oracle) {
      console.log("Seting oracle...");
      await definition.typeProperties.oracle.setter(actor, deployed, oracle);
    }

    return deployed;
  }
});
