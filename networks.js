
const refMap = {
  zrx: "ZRX",
  cUSDC: "cUSDC",
  oracle: "PriceOracle",
  xxx: "PriceOracleProxy",
  max: "Maximillion",
  cDAI: "cDAI",
  lens: "CompoundLens",
  dai: "DAI",
  g0: "StdComptroller",
  comptroller: "Unitroller",
  xxx: "cDaiDelegate",
  cBAT: "cBAT",
  xxx: "DSR_Kink_9000bps_Jump_12000bps_AssumedRF_500bps",
  xxx: "Base0bps_Slope2000bps",
  bat: "BAT",
  cErc20Delegate: "cErc20Delegate",
  g1: "StdComptrollerG1",
  cETH: "cETH",
  xxx: "Base500bps_Slope1200bps",
  cSAI: "cSAI",
  timelock: "Timelock",
  xxx: "Base200bps_Slope3000bps",
  cREP: "cREP",
  wbtc: "WBTC",
  sai: "SAI",
  rep: "REP",
  cZRX: "cZRX",
  cWBTC: "cWBTC",
  usdc: "USDC",
  xxx: "Base200bps_Slope222bps_Kink90_Jump10",
};

let multiRefMap = {
  ...refMap,
  comptroller: ["Comptroller", "Unitroller"]
};

function asArray(arr) {
  return Array.isArray(arr) ? arr : [arr];
}

function findAccount(accounts, account) {
  if (typeof(account) === 'string') {
    return account;
  } else if (account.type === 'account') {
    let account_ = account.account;
    if (accounts.hasOwnProperty(account_)) {
      return accounts[account_];
    } else {
      throw new Error(`Cannot find account ${account_} in account list ${JSON.stringify(Object.keys(accounts))}`);
    }
  }
}

function range(count) {
  return [...Array(count)];
}

function toNumberString(number) {
  if (number.type === 'number') {
    if (number.exp >= 0) {
      return number.base.toString() + range(number.exp).map(() => '0');
    }
  }

  throw new Error(`Cannot display number: ${JSON.stringify(number)}`);
}

function tokenProperties({address, deployment, properties}, state, accounts) {
  let cTokenProps = {};
  if (deployment.contract === 'ctoken') {
    cTokenProps = {
      underlying: state[properties.underlying].address,
      initial_exchange_rate_mantissa: properties.initial_exchange_rate.toString(),
      admin: findAccount(accounts, properties.account)
    }
  }

  return {
    name: properties.name,
    symbol: properties.symbol,
    decimals: properties.decimals,
    contract: deployment.contract,
    address: address,
    ...cTokenProps
  }
}

function mapContracts(state, filter, map, singleton=false, allowMissing=false, multi=false) {
  let stateEntries = Object.entries(state);
  let filteredEntries;

  if (typeof(filter) === 'function') {
    filteredEntries = stateEntries.filter(filter);
  } else if (Array.isArray(filter) || typeof(filter) === 'string') {
    filteredEntries = stateEntries.filter(([ref, {deployment}]) => {
      return deployment && asArray(filter).includes(deployment.contract)
    });
  } else if (filter === null) {
    filteredEntries = stateEntries;
  } else {
    throw new Error(`Unknown filter: ${filter}`);
  }

  let mappedEntries = filteredEntries.map(([ref, contract]) => {
    let useRefMap = multi ? multiRefMap : refMap;
    let mappedRef = asArray(useRefMap.hasOwnProperty(ref) ? useRefMap[ref] : ref);
    let mappedContract = map(contract);

    return mappedRef.map((r) => [r, mappedContract]);
  }).flat();
  if (multi) {
    console.log(mappedEntries)
  }

  if (singleton) {
    if (mappedEntries.length !== 1) {
      if (allowMissing && mappedEntries.length === 0) {
        return {};
      }
      throw new Error(`Expected single item for singleton with filter ${JSON.stringify(filter)}, got multiple: ${JSON.stringify(mappedEntries.map(([k, v]) => k))}`);
    } else {
      let [ref, mapped] = mappedEntries[0];
      return mapped;
    }
  } else {
    return Object.fromEntries(mappedEntries);
  }
}

hook('state.save', async (state) => {
  // TODO: Save ABI file
  // const readFile = (file) => util.promisify(fs.readFile)(file, 'utf8');
  // const fileExists = util.promisify(fs.exists);
  const writeFile = util.promisify(fs.writeFile);
  let stateEntries = Object.entries(state);

  let cETH = '0xTODO CETH';
  let accounts = {
    sender: '0xADMIN'
  };

  // TODO: Handle imports like test-net DAI
  let contractJson = mapContracts(state, null, ({address}) => address, false, false, true);
  let blocksJson = mapContracts(state, null, ({deployment}) => deployment.block);

  let priceOracleJson = mapContracts(
    state,
    ['SimplePriceOracle'],
    ({address}) => ({
      description: "Price Oracle Description",
      address
    }),
    true
  );

  let priceOracleProxyJson = mapContracts(
    state,
    ['PriceOracleProxy'],
    ({address}) => ({
      description: "Price Oracle Proxy Description",
      cETH: cETH,
      cUSDC: "0xTODO",
      cSAI: "0xTODO",
      cDAI: "0xTODO",
      address
    }),
    true,
    true
  );

  let maximillionJson = mapContracts(
    state,
    'Maximillion',
    ({address}) => ({
      description: 'Maximillion Description',
      cEtherAddress: cETH,
      address
    }),
    true,
    true
  );

  let compoundLensJson = mapContracts(
    state,
    'CompoundLens',
    ({deployment}) => ({
      name: 'CompoundLens',
      contract: deployment.contract
    }),
    true,
    true
  );

  let unitrollerJson = mapContracts(
    state,
    'Unitroller',
    ({address}) => ({
      description: 'Unitroller',
      address
    }),
    true,
    true
  );

  let comptrollerJson = mapContracts(
    state,
    'Comptroller',
    ({address, deployment}) => ({
      address,
      contract: deployment.contract,
      description: 'Comptroller Description'
    })
  );

  let timelockJson = mapContracts(
    state,
    'Timelock',
    ({address, deployment}) => ({
      address,
      contract: deployment.contract,
      description: 'Timelock Description'
    })
  );

  let constructorsJson = mapContracts(state, null, ({deployment}) => '0x' + deployment.constructorData);

  let tokensJson = mapContracts(
    state,
    ['Erc20', 'CErc20Delegator', 'CEther'],
    (contract) => tokenProperties(contract, state, accounts)
  );

  let cTokenDelegateJson = mapContracts(
    state,
    ['CErc20Delegate'], // etc
    ({address, deployment}) => ({
      address,
      contract: deployment.contract,
      description: 'Delegate Description'
    })
  );

  let cTokensJson = mapContracts(
    state,
    ['CErc20Delegator', 'CEther'], // etc
    (contract) => tokenProperties(contract, state, accounts)
  );

  let interestRateModelJson = mapContracts(
    state,
    ['JumpRateModel'], // etc
    ({address, deployment, properties}) => {
      let base = toNumberString(properties.base_rate);
      let slope = toNumberString(properties.multiplier);
      let kink = toNumberString(properties.kink);
      let jump = toNumberString(properties.jump_multiplier);

      return {
        name: "Interest Rate Model Name",
        contract: deployment.contract,
        description: ` Description baseRate=${base} multiplier=${slope} kink=${kink} jump=${jump}`,
        base: base,
        slope: slope,
        kink: kink,
        jump: jump,
        address
      };
    }
  );

  let networksJson = {
    'Contracts': contractJson,
    'Blocks': blocksJson,
    'PriceOracle': priceOracleJson,
    'PriceOracleProxy': priceOracleProxyJson,
    'Maximillion': maximillionJson,
    'CompoundLens': compoundLensJson,
    'Unitroller': unitrollerJson,
    'Comptroller': comptrollerJson,
    'Timelock': timelockJson,
    'Constructors': constructorsJson,
    'Tokens': tokensJson,
    'CTokenDelegate': cTokenDelegateJson,
    'cTokens': cTokensJson,
    'InterestRateModel': interestRateModelJson
  };

  let networkFile = path.join(process.cwd(), 'networks', `${network}.json`);
  await writeFile(networkFile, JSON.stringify(networksJson, null, 2));

  console.log(`Saved networks file: ${networkFile}`);
});
