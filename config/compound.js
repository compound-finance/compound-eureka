
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
    gas: 6600000,
    gasPrice: 1000000000 // 1 gwei
  },
  verificationOpts: network !== 'development' && env('etherscan') ? {
    verify: true,
    etherscanApiKey: env('etherscan'),
    raiseOnError: true
  } : {}
});

let stripColor = (str) => {
  return str.replace(/\x1B[[(?);]{0,2}(;?\d)*./g, '');
}

async function gov(actor, contract, func, args, opts={}) {
  return await govs(actor, [[contract, func, args, opts]]);
}

// Gov, but accepts a list of actions
async function govs(actor, actions) {
  let {read, encodeFunctionData, ethereum, show, trx} = actor;
  // TODO: Maybe check all actions, not just the first?
  let admin = await read(actions[0][0], 'admin(): address', [], actions[0][3] || {}); // TODO: Pass through opts?
  if (admin == ethereum.from) {
    for ([contract, func, args, opts] of actions) {
      await compoundTrx(actor, contract, func, args, opts);
    }
  } else {
    let {
      targets,
      values,
      funcs,
      calldatas,
      title,
      desc
    } = actions.reduce(({targets, values, funcs, calldatas, title, desc}, [contract, func, args, opts]) => {
      let newTitle = `${title} ${stripColor(show(contract))}:${func}`;
      console.log(args);
      let showArgs;
      if (Array.isArray(args)) {
        showArgs = args.map((arg) => `${stripColor(show(arg))}`).join(', ');
      } else {
        showArgs = Object.entries(args).map(([key, arg]) => `${key}=${stripColor(show(arg))}`).join(', ');
      }
      let newFunc = (opts || {}).canonical || func;
      let newDesc = `${desc}\n * ${func} [${showArgs}]`;
      let data = '0x' + encodeFunctionData(func, args);

      return {
        targets: [...targets, contract],
        values: [...values, 0],
        funcs: [...funcs, newFunc],
        calldatas: [...calldatas, data],
        title: newTitle,
        desc: newDesc
      }
    }, { targets: [], values: [], funcs: [], calldatas: [], title: " # Governance", desc: "" });

    // Okay, we're going to propose through the governor
    let proposeSig = 'propose(address[] memory targets, uint[] memory values, string[] memory signatures, bytes[] memory calldatas, string memory description)';
    let description = `${title}\n${desc}`;

    let proposalTrx = await trx('#gov', proposeSig, [targets, values, funcs, calldatas, description]);
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

async function cTokenAdminSetter(actor, cToken, newAdmin_, {symbol}) {
  let {deref, events, read, show, trx} = actor;
  let admin = await read(cToken, 'admin(): address');
  let newAdmin = deref(newAdmin_);

  if (admin !== newAdmin.address) {
    console.log(`Setting cToken ${symbol} admin from ${admin} to ${newAdmin.address}`);
    let _setPendingAdmin = await gov(actor, cToken, '_setPendingAdmin(address)', [newAdmin]);
    let _acceptAdmin = await trx(newAdmin, 'harnessAcceptAdmin(address cToken)', [cToken]);
  } else {
    console.log(`cToken ${symbol} already has admin set to ${admin}`);
  }
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
    admin: {
      type: 'address',
      setter: cTokenAdminSetter
    },
    underlying: { ref: 'Erc20' },
    comptroller: { ref: 'Unitroller' },
    decimals: { type: 'number', default: 8 },
    initial_exchange_rate: 'number',
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
    admin: {
      type: 'address',
      setter: cTokenAdminSetter
    },
    underlying: { ref: 'Erc20' },
    comptroller: { ref: 'Unitroller' },
    decimals: { type: 'number', default: 8 },
    delegate: { ref: 'CErc20Delegate' },
    become_implementation_data: { type: 'string', default: '0x' }, // TODO: 'bytes'?
    initial_exchange_rate: 'number',
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
    admin: {
      type: 'address',
      setter: cTokenAdminSetter
    },
    comptroller: { ref: 'Unitroller' },
    decimals: { type: 'number', default: 8 },
    initial_exchange_rate: 'number',
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
  match: {
    default: true
  },
  build: async ({deploy}, contract, props) => deploy(contract)
});

define("Comptroller", {
  match: {
    properties: {
      generation: 'g1'
    }
  },
  properties: {
    generation: 'string'
  },
  contract: 'ComptrollerG1',
  build: async ({deploy}, contract, props) => deploy(contract)
});

define("Comptroller", {
  match: {
    properties: {
      generation: 'g2'
    }
  },
  properties: {
    generation: 'string'
  },
  contract: 'ComptrollerG2',
  build: async ({deploy}, contract, props) => deploy(contract)
});

define("Comptroller", {
  match: {
    properties: {
      generation: 'g3'
    }
  },
  properties: {
    generation: 'string'
  },
  contract: 'ComptrollerG3',
  build: async ({deploy}, contract, props) => deploy(contract)
});

define("Comptroller", {
  match: {
    properties: {
      network: 'kovan'
    }
  },
  properties: {
    network: 'string'
  },
  contract: 'ComptrollerKovan',
  build: async ({deploy}, contract, props) => deploy(contract)
});

define("Comptroller", {
  match: {
    properties: {
      network: 'ropsten'
    }
  },
  properties: {
    network: 'string'
  },
  contract: 'ComptrollerRopsten',
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
      setter: async (actor, unitroller, max_assets) => {
        await gov(actor, unitroller, '_setMaxAssets(uint newMaxAssets)', [max_assets]);
      }
    },
    close_factor: {
      ref: 'Comptroller',
      deferred: true,
      setter: async (actor, unitroller, close_factor) => {
        await gov(actor, unitroller, '_setCloseFactor(uint newCloseFactorMantissa)', [close_factor]);
      }
    },
    generation: {
      type: 'string',
      setter: async (actor, unitroller, generatoin) => null
    },
    comp_rate: {
      type: 'number',
      setter: async (actor, unitroller, comp_rate) =>
        await gov(actor, unitroller, '_setCompRate(uint compRate_)', [comp_rate])
    },
    implementation: {
      ref: 'Comptroller',
      setter: async (actor, unitroller, comptroller, { properties: { comp_rate, generation, comp_markets, oracle, close_factor, max_assets, supported_markets } }) => {
        let actions = [[unitroller, '_setPendingImplementation(address)', [comptroller]]];
        switch (generation) {
          case 'g1':
            actions.push([comptroller, '_become(Unitroller unitroller, PriceOracle _oracle, uint _closeFactorMantissa, uint _maxAssets, bool reinitializing)', {
              unitroller,
              _oracle: oracle,
              _closeFactorMantissa: close_factor,
              _maxAssets: max_assets,
              reinitializing: false
            }, { canonical: '_become(address,address,uint256,uint256,bool)' }]);
            break;
          case 'g2':
            actions.push([comptroller, '_become(Unitroller unitroller)', { unitroller }, { canonical: '_become(address)' }]);
            break;
          case 'g3':
            // These properties may not be available yet
            supported_markets = supported_markets || [];
            comp_markets = comp_markets || [];

            let other_markets = supported_markets.filter((market) => comp_markets.includes(market));
            actions.push([comptroller,
              '_become(Unitroller unitroller, uint compRate_, address[] memory compMarketsToAdd, address[] memory otherMarketsToAdd)',
              {
                unitroller,
                compRate_: comp_rate || 0,
                compMarketsToAdd: comp_markets,
                otherMarketsToAdd: other_markets
              }, { canonical: '_become(address,uint256,address[],address[])' }]);
            break;
          case 'g4':
            actions.push([comptroller, '_become(Unitroller unitroller)', { unitroller }, { canonical: '_become(address)' }]);
            break;
          default:
            throw new Error(`Unknown generation: \`${generation}\` for _become`);
        }

        await govs(actor, actions);
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
        }, Promise.resolve(null));
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
        }, Promise.resolve(null));
      }
    },
    comp_markets: {
      type: 'array',
      deferred: true,
      order: 3,
      setter: async (actor, unitroller, markets, { properties }) => {
        let {events, read, show} = actor;
        let newMarkets = await markets.reduce(async (acc, market) => {
          let marketData = await read(unitroller, 'markets', [market], { proxy: 'Comptroller' });

          if (marketData.isListed && !marketData.isComped) { //  && market.ref !== 'cETH'
            return [
              ...(await acc),
              market
            ];
          } else {
            return await acc;
          }
        }, Promise.resolve([]));
        if (newMarkets.length === 0) {
          console.log("All Markets Comped");
        } else {
          await gov(actor, unitroller, '_addCompMarkets(address[])', [newMarkets]);
        }
      }
    },
    admin: {
      type: 'address',
      deferred: true,
      setter: async (actor, unitroller, newAdmin_) => {
        let {deref, events, read, show, trx} = actor;
        let admin = await read(unitroller, 'admin(): address');
        let newAdmin = deref(newAdmin_);

        if (admin !== newAdmin.address) {
          console.log(`Setting Unitroller admin from ${admin} to ${newAdmin.address}`);
          // Admin must be accepted
          let _setPendingAdmin = await gov(actor, unitroller, '_setPendingAdmin(address)', [newAdmin]);
          // TODO: Should this be gov, too?
          let _acceptAdmin = await trx(newAdmin, 'harnessAcceptAdmin(address unitroller)', [unitroller]);
        }
      }
    }
  },
  build: async (actor, contract, properties, { definition }) => {
    let {implementation, oracle, supported_markets, comp_markets, collateral_factors, max_assets, close_factor, admin} = properties;
    let deployed = await actor.deploy(contract);

    // We can't set these properties in the constructor, so they'll
    // need to be set by calling the setters directly
    if (implementation) {
      console.log("Setting implementation...");
      console.log({properties});
      await definition.typeProperties.implementation.setter(actor, deployed, implementation, {properties});
    }

    if (oracle) {
      console.log("Setting oracle...");
      await definition.typeProperties.oracle.setter(actor, deployed, oracle, {properties});
    }

    if (supported_markets) {
      console.log("Supporting markets...");
      await definition.typeProperties.supported_markets.setter(actor, deployed, supported_markets, {properties});
    }

    if (collateral_factors) {
      console.log("Setting collateral factors...");
      await definition.typeProperties.collateral_factors.setter(actor, deployed, collateral_factors, {properties});
    }

    if (comp_markets) {
      console.log("Setting comp markets...");
      await definition.typeProperties.comp_markets.setter(actor, deployed, comp_markets, {properties});
    }

    if (max_assets) {
      console.log("Setting max assets...");
      await definition.typeProperties.max_assets.setter(actor, deployed, max_assets, {properties});
    }

    if (close_factor) {
      console.log("Setting close factor...");
      await definition.typeProperties.close_factor.setter(actor, deployed, close_factor, {properties});
    }

    if (admin) {
      console.log("Setting admin...");
      await definition.typeProperties.admin.setter(actor, deployed, admin, {properties});
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
