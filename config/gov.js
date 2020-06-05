
// Build Comp Token
define('Comp', {
  match: {
    default: true
  },
  contract: 'Comp',
  properties: {
    name: 'string',
    decimals: 'number',
    symbol: 'string',
    balances: {
      deferred: true,
      dictionary: {
        key: 'ref',
        value: 'number'
      },
      setter: async (actor, contract, balances) => {
        let {bn, deref, encode, ethereum, read, trx} = actor;
        return Object.entries(balances).reduce(async (acc_, [ref, balance_]) => {
          let acc = await acc_; // force ordering

          let balance = bn(balance_);
          let currentBalance = await balanceOf(actor, contract, ref);

          if (currentBalance.gte(balance)) {
            console.log(`Skipping ${ref} as account holds sufficient balance`);
          } else {
            let amount = balance.sub(currentBalance);

            await trx(contract, 'transfer', [ref, amount]);

            // Let's make sure the balance is, in fact, updated correctly
            let newBalance = await balanceOf(actor, contract, ref);
            if (newBalance.lt(balance)) {
              throw new Error(`Expected balance for ${ref} to be greater than or equal to ${balance.toString()} but was ${newBalance.toString()}`);
            }
          }
        }, Promise.resolve(null));
      }
    },
    delegates: {
      deferred: true,
      dictionary: {
        key: 'ref',
        value: 'ref'
      },
      setter: async (actor, comp, delegates) => {
        let {bn, deref, encode, ethereum, read, trx} = actor;
        return Object.entries(delegates).reduce(async (acc_, [ref, delegate]) => {
          let acc = await acc_; // force ordering

          console.log(`Setting delegate for ${JSON.stringify(ref)} to ${JSON.stringify(delegate)}`);
          if (deref(ref).address !== ethereum.from) {
            throw new Error(`Cannot set delegate for ${JSON.stringify(ref)}`);
          }

          await trx(comp, 'delegate', [delegate]);
        }, Promise.resolve(null));
      }
    }
  },
  build: async (actor, contract, {balances, delegates}, { definition }) => {
    let {deploy, ethereum} = actor;
    let deployed = await deploy(contract, {
      account: ethereum.from
    });
    if (balances) {
      console.log(`Setting token balances for ${contract}...`);
      await definition.typeProperties.balances.setter(actor, deployed, balances);
    }
    if (delegates) {
      console.log(`Setting token delegates for ${contract}...`);
      await definition.typeProperties.delegates.setter(actor, deployed, delegates);
    }
    return deployed;
  }
});

define('Comp', {
  match: {
    has_properties: ['address']
  },
  contract: 'Comp',
  properties: {
    address: 'address'
  },
  build: async ({existing}, contract, { address }) => {
    return existing(contract, address);
  }
});

define('Timelock', {
  contract: 'TimelockTest',
  match: {
    has_properties: ['delay']
  },
  properties: {
    delay: 'number',
    admin: {
      type: 'address',
      deferred: true,
      setter: async ({trx}, contract, admin) => {
        await trx(contract, 'harnessSetAdmin', [admin]);
      }
    }
  },
  build: async ({deploy, ethereum}, contract, {admin, delay}) => {
    return deploy(contract, {
      admin_: admin || ethereum.from,
      delay_: delay
    });
  }
});

define('Governor', {
  contract: 'GovernorAlphaHarness',
  match: {
    properties: {
      harness: true
    }
  },
  properties: {
    harness: 'bool',
    timelock: { ref: 'Timelock' },
    comp: { ref: 'Comp' }
  },
  build: async ({deploy, ethereum}, contract, { comp, timelock }) => {
    return deploy(contract, {
      timelock_: timelock,
      comp_: comp,
      guardian_: ethereum.from
    });
  }
});

define('Reservoir', {
  properties: {
    drip_rate: 'number',
    token: 'address',
    target: 'address'
  },
  build: async ({deploy, ethereum}, contract, { drip_rate, token, target }) => {
    return deploy(contract, {
      dripRate_: drip_rate,
      token_: token,
      target_: target
    });
  }
});
