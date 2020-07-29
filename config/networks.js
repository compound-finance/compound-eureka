
function asArray(arr) {
  return Array.isArray(arr) ? arr : [arr];
}

function findAccount(state, accounts, account) {
  if (typeof(account) === 'string') {
    return account;
  } else if (typeof(account) === 'object' && account.type === 'account') {
    let account_ = account.account;
    if (accounts.hasOwnProperty(account_)) {
      return accounts[account_];
    } else {
      throw new Error(`Cannot find account ${account_} in account list ${JSON.stringify(Object.keys(accounts))}`);
    }
  } else if (typeof(account) === 'object' && account.type === 'ref') {
    let ref_ = account.ref;
    if (state.hasOwnProperty(ref_)) {
      return state[ref_].address;
    } else {
      throw new Error(`Cannot find account by reference #${ref_} in state`);
    }
  } else {
    throw new Error(`Cannot find account from ${JSON.stringify(account)}`);
  }
}

function range(count) {
  return [...Array(count)];
}

function toNumberString(number) {
  if (typeof(number) === 'number') {
    return number.toString();
  } else if (typeof(number) === 'object' && number.type === 'number') {
    if (number.exp >= 0) {
      return number.base.toString() + range(number.exp).map(() => '0').join('');
    }
  }

  throw new Error(`Cannot display number: ${JSON.stringify(number)}`);
}

function toNumber(number) {
  return Number(toNumberString(number));
}

function tokenProperties({address, contract, definition, deployment, properties}, state, accounts) {
  let cTokenProps = {};
  if (definition === 'CToken') {
    cTokenProps = {      
      initial_exchange_rate_mantissa: toNumberString(properties.initial_exchange_rate),
      admin: findAccount(state, accounts, properties.admin),
      underlying: properties.underlying ? state[properties.underlying.ref].address : "" // Note: this key is required, even if it's blank
    } 
  }

  let contractJson = deployment && { contract: deployment.contract };

  return {
    name: properties.name,
    symbol: properties.symbol,
    decimals: toNumber(properties.decimals),
    address: address,
    ...cTokenProps,
    ...contractJson
  }
}

function mapContracts(state, refMap, filter, map, singleton=false, allowMissing=false) {
  let stateEntries = Object.entries(state);
  let filteredEntries;

  if (typeof(filter) === 'function') {
    filteredEntries = stateEntries.filter(filter);
  } else if (Array.isArray(filter) || typeof(filter) === 'string') {
    filteredEntries = stateEntries.filter(([ref, {definition, deployment}]) => {
      let filterArr = asArray(filter);
      return (deployment &&
        filterArr.includes(deployment.contract) ||
        filterArr.includes(definition)
      )
    });
  } else if (filter === null) {
    filteredEntries = stateEntries;
  } else {
    throw new Error(`Unknown filter: ${filter}`);
  }

  let mappedEntries = filteredEntries.map(([ref, contract]) => {
    let r;
    if (typeof(refMap) === 'function') {
      r = refMap(contract);
    } else {
      r = refMap.hasOwnProperty(ref) ? refMap[ref] : ref;
    }

    return [r, map(contract, ref)];
  }).filter(([k, v]) => v !== null);

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

hook('state.save', async (state, {ethereum}) => {
  // We wrap this in a try since if it fails, we can always re-run with `refresh` command
  try {
    const readFile = (file) => util.promisify(fs.readFile)(file, 'utf8');
    const writeFile = util.promisify(fs.writeFile);
    let stateEntries = Object.entries(state);

    let refMapFile = path.join(process.cwd(), 'refMap.json');
    let refMap = JSON.parse(await readFile(refMapFile));

    let cETH = state.cETH.address;
    let accounts = {
      sender: ethereum.from
    };

    // TODO: Handle imports like test-net DAI
    let contractsJson = mapContracts(state, refMap, null, ({address}) => address, false, false, true);
    contractsJson.Comptroller = contractsJson.Unitroller; // Comptroller is special

    let blocksJson = mapContracts(state, refMap, null, ({deployment, properties}) =>
      deployment ? deployment.block : (
        properties.block ? toNumber(properties.block) : null
      )
    );

    let priceFeedJson = mapContracts(
      state,
      refMap,
      ['PriceFeed'],
      ({address}) => ({
        description: "Price Feed",
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
      refMap,
      'Maximillion',
      ({address}) => ({
        description: 'Maximillion',
        cEtherAddress: cETH,
        address
      }),
      true,
      true
    );

    let compoundLensJson = mapContracts(
      state,
      refMap,
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
      refMap,
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
      refMap,
      'Comptroller',
      ({address, deployment}) => ({
        address,
        contract: deployment.contract,
        description: 'Comptroller Description'
      })
    );

    // TODO
    let timelockJson = mapContracts(
      state,
      refMap,
      'Timelock',
      ({address, deployment}) => ({
        address,
        contract: deployment.contract,
        description: 'Timelock'
      })
    );

    let constructorsJson = mapContracts(state, refMap,null, ({deployment}) => deployment ? '0x' + deployment.constructorData : null);

    let tokensJson = mapContracts(
      state,
      (contract) => contract.properties.symbol,
      ['Erc20', 'CToken', 'Comp'],
      (contract) => tokenProperties(contract, state, accounts)
    );
    tokensJson.ETH = {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
      address: "0x0000000000000000000000000000000000000000"
    };

    let cTokenDelegateJson = mapContracts(
      state,
      (contract) => contract.properties.symbol,
      ['CErc20Delegate', 'CDaiDelegate'],
      ({address, deployment}) => ({
        address,
        contract: deployment.contract,
        description: `Delegate ${deployment.contract}`
      })
    );

    let cTokensJson = mapContracts(
      state,
      refMap,
      ['CToken'],
      (contract) => tokenProperties(contract, state, accounts)
    );

    let interestRateModelJson = mapContracts(
      state,
      refMap,
      ['WhitePaperInterestRateModel', 'JumpRateModel', 'DAIInterestRateModelV2'],
      ({address, deployment, properties}, ref) => {
        let values = {
          base: properties.base ? toNumberString(properties.base) : null,
          slope: properties.slope ? toNumberString(properties.slope) : null,
          jump: properties.jump ? toNumberString(properties.jump) : null,
          kink: properties.kink ? toNumberString(properties.kink) : null,
        };

        values = Object.fromEntries(Object.entries(values).filter(([k, v]) => !!v));

        let keyMap = {
          base: 'baseRate',
          slope: 'multiplier',
          kink: 'kink',
          jump: 'jump'
        };

        let description = Object.entries(values).reduce((acc, [key, value]) => {
          if (keyMap[key]) {
            return `${acc} ${keyMap[key]}=${value}`;
          } else {
            return acc;
          }
        }, `${deployment.contract} `);

        return {
          name: ref,
          contract: deployment.contract,
          description,
          address,
          ...values,
        };
      }
    );

    let networksJson = {
      'Contracts': contractsJson,
      'Blocks': blocksJson,
      'PriceFeed': priceFeedJson,
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
  }
  catch (e) {
    console.error(e);
    console.log(`Error saving networks file: ${e.toString()}\n`);
  }
});
